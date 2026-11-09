//! Rate limits, retries and backoff, against a local server and on a paused
//! clock. The stress tests prove the client never starts more requests than
//! MangaDex's documented limits allow, in any window.

// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::{MOONLIT, client, config, json, uncached};
use kirei_mangadex::{Limits, MangaDex, MangaDexError, RateLimiter, SearchQuery};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

/// The most events inside any half-open window `[t, t + window)`.
fn busiest_window<T: Copy + Ord + std::ops::Sub<Output = Duration>>(
    times: &mut [T],
    window: Duration,
) -> usize {
    times.sort();
    let mut busiest = 0;
    let mut start = 0;
    for end in 0..times.len() {
        while times[end] - times[start] >= window {
            start += 1;
        }
        busiest = busiest.max(end - start + 1);
    }
    busiest
}

#[tokio::test(start_paused = true)]
async fn stress_global_limit_never_exceeds_five_per_second() {
    let limiter = Arc::new(RateLimiter::new(Limits::default().global));
    assert_eq!(limiter.window().max, 5);
    let started = tokio::time::Instant::now();
    let mut tasks = Vec::new();
    for _ in 0..500 {
        let limiter = limiter.clone();
        tasks.push(tokio::spawn(async move {
            limiter.acquire().await;
            tokio::time::Instant::now()
        }));
    }
    let mut starts = Vec::new();
    for task in tasks {
        starts.push(task.await.unwrap());
    }
    assert_eq!(busiest_window(&mut starts, Duration::from_secs(1)), 5);
    // And it is not slower than it has to be: 500 requests, 5 a second.
    let elapsed = starts.iter().max().unwrap().duration_since(started);
    assert_eq!(elapsed, Duration::from_secs(99));
}

#[tokio::test(start_paused = true)]
async fn stress_at_home_limit_never_exceeds_forty_per_minute() {
    let limiter = Arc::new(RateLimiter::new(Limits::default().at_home));
    let mut tasks = Vec::new();
    for _ in 0..200 {
        let limiter = limiter.clone();
        tasks.push(tokio::spawn(async move {
            limiter.acquire().await;
            tokio::time::Instant::now()
        }));
    }
    let mut starts = Vec::new();
    for task in tasks {
        starts.push(task.await.unwrap());
    }
    assert_eq!(busiest_window(&mut starts, Duration::from_secs(60)), 40);
}

#[tokio::test(start_paused = true)]
async fn stress_bursts_and_pauses_stay_within_the_limit() {
    // Callers arriving in irregular bursts, with a 429 pause in the middle.
    let limiter = Arc::new(RateLimiter::new(Limits::default().global));
    let mut tasks = Vec::new();
    for burst in 0..20u64 {
        for _ in 0..(burst % 7 + 1) {
            let limiter = limiter.clone();
            tasks.push(tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(burst * 370)).await;
                limiter.acquire().await;
                tokio::time::Instant::now()
            }));
        }
    }
    let pause_from = tokio::time::Instant::now() + Duration::from_secs(2);
    let pausing = limiter.clone();
    let pause = tokio::spawn(async move {
        tokio::time::sleep_until(pause_from).await;
        pausing
            .pause_until(pause_from + Duration::from_secs(3))
            .await;
    });
    let mut starts = Vec::new();
    for task in tasks {
        starts.push(task.await.unwrap());
    }
    pause.await.unwrap();
    assert!(busiest_window(&mut starts, Duration::from_secs(1)) <= 5);
    assert!(
        !starts
            .iter()
            .any(|at| *at > pause_from && *at < pause_from + Duration::from_secs(3)),
        "a request started during the pause"
    );
}

/// Records when each request reached the server.
struct Arrivals {
    times: Arc<Mutex<Vec<Instant>>>,
}

impl Respond for Arrivals {
    fn respond(&self, _: &Request) -> ResponseTemplate {
        self.times.lock().unwrap().push(Instant::now());
        json("search_manga.json")
    }
}

#[tokio::test]
async fn stress_the_server_never_sees_more_than_five_requests_a_second() {
    let server = MockServer::start().await;
    let times = Arc::new(Mutex::new(Vec::new()));
    Mock::given(method("GET"))
        .and(path("/manga"))
        .respond_with(Arrivals {
            times: times.clone(),
        })
        .mount(&server)
        .await;

    let md = uncached(&server);
    let mut tasks = Vec::new();
    for index in 0..16 {
        let md = md.clone();
        tasks.push(tokio::spawn(async move {
            md.search(&SearchQuery::title(format!("query {index}")))
                .await
                .unwrap();
        }));
    }
    for task in tasks {
        task.await.unwrap();
    }
    let mut arrivals = times.lock().unwrap().clone();
    assert_eq!(arrivals.len(), 16);
    // Measured at the server, so network jitter can only spread requests
    // out; a small allowance covers clock reads on the two sides.
    let busiest = busiest_window(&mut arrivals, Duration::from_millis(990));
    assert!(busiest <= 5, "{busiest} requests inside one second");
}

#[tokio::test]
async fn retries_server_errors_with_backoff() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(ResponseTemplate::new(503))
        .up_to_n_times(2)
        .expect(2)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(json("manga.json"))
        .expect(1)
        .mount(&server)
        .await;
    let manga = client(&server).manga(MOONLIT).await.unwrap();
    assert_eq!(manga.id, MOONLIT);
}

#[tokio::test]
async fn gives_up_after_the_last_retry() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(ResponseTemplate::new(502))
        .expect(4)
        .mount(&server)
        .await;
    let error = client(&server).manga(MOONLIT).await.unwrap_err();
    assert!(
        matches!(error, MangaDexError::Api { status: 502, .. }),
        "{error:?}"
    );
}

#[tokio::test]
async fn honours_retry_after_on_429() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "1"))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MOONLIT}")))
        .respond_with(json("manga.json"))
        .mount(&server)
        .await;
    let started = Instant::now();
    client(&server).manga(MOONLIT).await.unwrap();
    assert!(started.elapsed() >= Duration::from_millis(950));
}

#[tokio::test]
async fn a_long_429_wait_is_returned_and_holds_every_request() {
    let server = MockServer::start().await;
    let until = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 120;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(429).insert_header("x-ratelimit-retry-after", until.to_string()),
        )
        .expect(1)
        .mount(&server)
        .await;
    let md = client(&server);
    let error = md.manga(MOONLIT).await.unwrap_err();
    match error {
        MangaDexError::RateLimited { retry_after } => {
            assert!(retry_after > Duration::from_secs(100));
        }
        other => panic!("{other:?}"),
    }
    // Nothing else goes out while the limit lasts.
    let held = tokio::time::timeout(Duration::from_millis(300), md.tags()).await;
    assert!(held.is_err(), "a request went out during the 429 pause");
}

#[tokio::test]
async fn a_403_without_an_api_error_is_a_ban_and_pauses_requests() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(403).set_body_string("<html>Forbidden</html>"))
        .expect(1)
        .mount(&server)
        .await;
    let mut config = config(&server);
    config.limits.ban_cooldown = Duration::from_secs(60);
    let md = MangaDex::new(config).unwrap();
    let error = md.manga(MOONLIT).await.unwrap_err();
    assert!(matches!(error, MangaDexError::Blocked), "{error:?}");
    let held = tokio::time::timeout(Duration::from_millis(300), md.tags()).await;
    assert!(held.is_err(), "a request went out during the ban cool-down");
}
