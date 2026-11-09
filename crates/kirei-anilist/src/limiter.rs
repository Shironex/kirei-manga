//! The request budget for AniList.
//!
//! A sliding window: no span of `per` ever holds more than `max` request
//! starts. On top of it a minimum gap between two starts keeps the client
//! away from AniList's burst limiter, which has no published number. The
//! window size follows what AniList reports in `X-RateLimit-Limit`, so the
//! client slows down on its own when the API is in its degraded mode and
//! never goes above the configured ceiling. A 429 pauses every request until
//! the time AniList names.
//!
//! Time comes from `tokio::time`, so tests run the limiter on a paused clock.

use std::collections::VecDeque;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::time::{Instant, sleep_until};

#[derive(Debug)]
struct State {
    /// Start times handed out, oldest first. Entries may lie in the future.
    starts: VecDeque<Instant>,
    max: u32,
    paused_until: Option<Instant>,
}

/// Shared by every request the app sends to AniList.
#[derive(Debug)]
pub(crate) struct RateLimiter {
    per: Duration,
    min_gap: Duration,
    ceiling: u32,
    state: Mutex<State>,
}

impl RateLimiter {
    /// `max` starts per `per` to begin with, at most `ceiling` however high
    /// AniList reports its limit.
    pub(crate) fn new(max: u32, ceiling: u32, per: Duration, min_gap: Duration) -> Self {
        let ceiling = ceiling.max(1);
        Self {
            per,
            min_gap,
            ceiling,
            state: Mutex::new(State {
                starts: VecDeque::new(),
                max: max.clamp(1, ceiling),
                paused_until: None,
            }),
        }
    }

    /// The budget in force now.
    pub(crate) async fn max(&self) -> u32 {
        self.state.lock().await.max
    }

    /// Follows the limit AniList reported, within `1..=ceiling`.
    pub(crate) async fn set_max(&self, reported: u32) {
        self.state.lock().await.max = reported.clamp(1, self.ceiling);
    }

    /// Waits until one more request may start, and counts it.
    pub(crate) async fn acquire(&self) {
        loop {
            let slot = {
                let mut state = self.state.lock().await;
                let now = Instant::now();
                match state.paused_until {
                    Some(until) if until > now => Err(until),
                    _ => {
                        state.paused_until = None;
                        Ok(self.reserve(&mut state, now))
                    }
                }
            };
            match slot {
                Err(until) => sleep_until(until).await,
                Ok(at) => {
                    sleep_until(at).await;
                    // A 429 may have paused everything while this caller slept.
                    let paused = self.state.lock().await.paused_until;
                    match paused {
                        Some(until) if until > Instant::now() => continue,
                        _ => return,
                    }
                }
            }
        }
    }

    /// Holds every request back until `until`. A shorter pause never cuts a
    /// longer one short.
    pub(crate) async fn pause_until(&self, until: Instant) {
        let mut state = self.state.lock().await;
        if state.paused_until.is_none_or(|current| current < until) {
            state.paused_until = Some(until);
        }
    }

    fn reserve(&self, state: &mut State, now: Instant) -> Instant {
        while let Some(&oldest) = state.starts.front() {
            if oldest + self.per <= now {
                state.starts.pop_front();
            } else {
                break;
            }
        }
        let max = state.max as usize;
        let mut at = now;
        if state.starts.len() >= max {
            // A full window after the start `max` places back.
            let anchor = state.starts[state.starts.len() - max];
            at = at.max(anchor + self.per);
        }
        if let Some(&last) = state.starts.back() {
            at = at.max(last + self.min_gap);
        }
        state.starts.push_back(at);
        at
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINUTE: Duration = Duration::from_secs(60);

    #[tokio::test(start_paused = true)]
    async fn never_more_than_the_budget_in_a_minute() {
        let limiter = RateLimiter::new(30, 90, MINUTE, Duration::ZERO);
        let start = Instant::now();
        let mut starts = Vec::new();
        for _ in 0..95 {
            limiter.acquire().await;
            starts.push(Instant::now());
        }
        assert_eq!(starts[29], start);
        assert_eq!(starts[30] - start, MINUTE);
        for (i, at) in starts.iter().enumerate().skip(30) {
            assert!(*at - starts[i - 30] >= MINUTE, "start {i} broke the window");
        }
    }

    #[tokio::test(start_paused = true)]
    async fn spaces_starts_by_the_minimum_gap() {
        let limiter = RateLimiter::new(30, 90, MINUTE, Duration::from_millis(500));
        let start = Instant::now();
        for _ in 0..3 {
            limiter.acquire().await;
        }
        assert_eq!(Instant::now() - start, Duration::from_secs(1));
    }

    #[tokio::test(start_paused = true)]
    async fn follows_the_reported_limit_within_the_ceiling() {
        let limiter = RateLimiter::new(30, 90, MINUTE, Duration::ZERO);
        limiter.set_max(500).await;
        assert_eq!(limiter.max().await, 90);
        limiter.set_max(0).await;
        assert_eq!(limiter.max().await, 1);
        limiter.set_max(30).await;
        assert_eq!(limiter.max().await, 30);
    }

    #[tokio::test(start_paused = true)]
    async fn a_pause_holds_every_caller() {
        let limiter = RateLimiter::new(30, 90, MINUTE, Duration::ZERO);
        let start = Instant::now();
        limiter.pause_until(start + Duration::from_secs(30)).await;
        limiter.pause_until(start + Duration::from_secs(2)).await;
        limiter.acquire().await;
        assert_eq!(Instant::now() - start, Duration::from_secs(30));
    }
}
