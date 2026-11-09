//! Sliding window rate limiting.
//!
//! A [`RateLimiter`] lets at most `max` requests start within any span of
//! `per`. Callers reserve a start time under a short lock and then sleep until
//! it, so waiters are served in arrival order and nobody spins. A limiter can
//! also be paused until an instant, which is how a 429 from MangaDex stops
//! every request that shares the limit, not only the one that got it.
//!
//! Time comes from `tokio::time`, so tests can run the limiter on a paused
//! clock and check thousands of requests in milliseconds.

use std::collections::VecDeque;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::time::{Instant, sleep_until};

/// At most `max` requests in any window of `per`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RateWindow {
    pub max: u32,
    pub per: Duration,
}

impl RateWindow {
    pub const fn new(max: u32, per: Duration) -> Self {
        Self { max, per }
    }

    pub const fn per_second(max: u32) -> Self {
        Self::new(max, Duration::from_secs(1))
    }

    pub const fn per_minute(max: u32) -> Self {
        Self::new(max, Duration::from_secs(60))
    }

    pub const fn per_hour(max: u32) -> Self {
        Self::new(max, Duration::from_secs(60 * 60))
    }
}

#[derive(Debug, Default)]
struct State {
    /// Start times handed out, oldest first. Entries may lie in the future.
    starts: VecDeque<Instant>,
    paused_until: Option<Instant>,
}

/// A sliding window limiter shared by every request that counts against one
/// limit.
#[derive(Debug)]
pub struct RateLimiter {
    window: RateWindow,
    state: Mutex<State>,
}

impl RateLimiter {
    pub fn new(window: RateWindow) -> Self {
        assert!(
            window.max > 0,
            "a rate window must allow at least one request"
        );
        Self {
            window,
            state: Mutex::new(State::default()),
        }
    }

    pub fn window(&self) -> RateWindow {
        self.window
    }

    /// Waits until one more request may start, and counts it.
    pub async fn acquire(&self) {
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
                // Paused: wait it out, then reserve a fresh slot.
                Err(until) => sleep_until(until).await,
                Ok(at) => {
                    sleep_until(at).await;
                    // A 429 may have paused the limiter while this caller
                    // slept. Its old slot stays counted, which only errs on
                    // the slow side.
                    let paused = self.state.lock().await.paused_until;
                    match paused {
                        Some(until) if until > Instant::now() => continue,
                        _ => return,
                    }
                }
            }
        }
    }

    /// Holds every request back until `until`. A later pause wins over an
    /// earlier one; a shorter one never cuts a longer one short.
    pub async fn pause_until(&self, until: Instant) {
        let mut state = self.state.lock().await;
        if state.paused_until.is_none_or(|current| current < until) {
            state.paused_until = Some(until);
        }
    }

    fn reserve(&self, state: &mut State, now: Instant) -> Instant {
        let max = self.window.max as usize;
        // Forget starts that can no longer share a window with anything new.
        while let Some(&oldest) = state.starts.front() {
            if oldest + self.window.per <= now {
                state.starts.pop_front();
            } else {
                break;
            }
        }
        let at = if state.starts.len() < max {
            now
        } else {
            // The new start must sit a full window after the start `max`
            // places back, so no window of `per` ever holds more than `max`.
            let anchor = state.starts[state.starts.len() - max];
            (anchor + self.window.per).max(now)
        };
        state.starts.push_back(at);
        at
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn lets_a_burst_through_then_spaces_the_rest() {
        let limiter = RateLimiter::new(RateWindow::per_second(5));
        let start = Instant::now();
        for _ in 0..5 {
            limiter.acquire().await;
        }
        assert_eq!(Instant::now(), start);
        limiter.acquire().await;
        assert_eq!(Instant::now() - start, Duration::from_secs(1));
    }

    #[tokio::test(start_paused = true)]
    async fn a_pause_holds_every_caller() {
        let limiter = RateLimiter::new(RateWindow::per_second(5));
        let start = Instant::now();
        limiter.pause_until(start + Duration::from_secs(30)).await;
        // A shorter pause does not shorten it.
        limiter.pause_until(start + Duration::from_secs(2)).await;
        limiter.acquire().await;
        assert_eq!(Instant::now() - start, Duration::from_secs(30));
    }
}
