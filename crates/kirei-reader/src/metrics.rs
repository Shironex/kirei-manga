use std::collections::VecDeque;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

/// Samples kept per log. Enough for stable percentiles over the last few
/// minutes of reading, small enough to sort on every stats call.
const WINDOW: usize = 512;

/// Percentiles over the most recent samples of one timing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LatencySummary {
    /// Samples recorded since the reader started (not only the window).
    pub count: u64,
    pub p50_us: u64,
    pub p95_us: u64,
    pub max_us: u64,
}

/// A rolling window of durations, in microseconds.
#[derive(Default)]
pub(crate) struct LatencyLog {
    inner: Mutex<(VecDeque<u64>, u64)>,
}

impl LatencyLog {
    pub(crate) fn record(&self, elapsed: Duration) {
        let micros = u64::try_from(elapsed.as_micros()).unwrap_or(u64::MAX);
        let mut inner = self.inner.lock().unwrap_or_else(PoisonError::into_inner);
        if inner.0.len() == WINDOW {
            inner.0.pop_front();
        }
        inner.0.push_back(micros);
        inner.1 += 1;
    }

    pub(crate) fn summary(&self) -> LatencySummary {
        let (mut samples, count) = {
            let inner = self.inner.lock().unwrap_or_else(PoisonError::into_inner);
            (Vec::from(inner.0.clone()), inner.1)
        };
        if samples.is_empty() {
            return LatencySummary::default();
        }
        samples.sort_unstable();
        let at = |q: usize| samples[(samples.len() * q / 100).min(samples.len() - 1)];
        LatencySummary {
            count,
            p50_us: at(50),
            p95_us: at(95),
            max_us: samples[samples.len() - 1],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarises_the_recent_window() {
        let log = LatencyLog::default();
        assert_eq!(log.summary(), LatencySummary::default());
        for micros in 1..=100 {
            log.record(Duration::from_micros(micros));
        }
        let summary = log.summary();
        assert_eq!(summary.count, 100);
        assert_eq!(summary.p50_us, 51);
        assert_eq!(summary.p95_us, 96);
        assert_eq!(summary.max_us, 100);
    }

    #[test]
    fn forgets_samples_older_than_the_window() {
        let log = LatencyLog::default();
        for _ in 0..WINDOW {
            log.record(Duration::from_secs(1));
        }
        for _ in 0..WINDOW {
            log.record(Duration::from_micros(5));
        }
        let summary = log.summary();
        assert_eq!(summary.count, 2 * WINDOW as u64);
        assert_eq!(summary.max_us, 5);
    }
}
