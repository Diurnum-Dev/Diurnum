//! Process-global single-flight guard used to stop a second AI Assist chunk
//! run from starting for a workspace that already has one in flight. Without
//! this, an overlapping call could spend BYO adapter tokens redundantly.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

static AI_ASSIST_INFLIGHT: LazyLock<Mutex<HashSet<PathBuf>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// RAII guard marking a workspace path as "in flight". While a guard for a
/// given path is alive, `try_acquire` for that same path returns `None`.
/// Dropping the guard releases the path.
pub struct InflightGuard {
    path: PathBuf,
}

impl InflightGuard {
    /// Attempts to claim `path` for the caller. Returns `Some(guard)` if no
    /// other guard currently holds the (canonicalized) path, or `None` if
    /// one does.
    pub fn try_acquire(path: impl AsRef<Path>) -> Option<InflightGuard> {
        let path = path.as_ref();
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let mut inflight = AI_ASSIST_INFLIGHT
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if inflight.insert(canonical.clone()) {
            Some(InflightGuard { path: canonical })
        } else {
            None
        }
    }
}

impl Drop for InflightGuard {
    fn drop(&mut self) {
        if let Ok(mut inflight) = AI_ASSIST_INFLIGHT.lock() {
            inflight.remove(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_acquire_succeeds_for_a_fresh_path() {
        let dir = tempfile::tempdir().unwrap();

        let guard = InflightGuard::try_acquire(dir.path());

        assert!(guard.is_some());
    }

    #[test]
    fn try_acquire_fails_while_a_guard_for_the_same_path_is_alive() {
        let dir = tempfile::tempdir().unwrap();
        let _first = InflightGuard::try_acquire(dir.path()).expect("first acquire should succeed");

        let second = InflightGuard::try_acquire(dir.path());

        assert!(
            second.is_none(),
            "second acquire for the same path should be rejected while the first guard is held"
        );
    }

    #[test]
    fn try_acquire_succeeds_again_after_the_prior_guard_drops() {
        let dir = tempfile::tempdir().unwrap();
        let first = InflightGuard::try_acquire(dir.path()).expect("first acquire should succeed");
        drop(first);

        let second = InflightGuard::try_acquire(dir.path());

        assert!(
            second.is_some(),
            "acquire should succeed again once the prior guard for the path is dropped"
        );
    }

    #[test]
    fn distinct_paths_can_both_acquire_simultaneously() {
        let dir_a = tempfile::tempdir().unwrap();
        let dir_b = tempfile::tempdir().unwrap();

        let guard_a = InflightGuard::try_acquire(dir_a.path());
        let guard_b = InflightGuard::try_acquire(dir_b.path());

        assert!(guard_a.is_some());
        assert!(guard_b.is_some());
    }
}
