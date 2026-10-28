use super::error::{LeagueError, Result};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use uuid::Uuid;
#[derive(Clone, Copy)]
pub enum Kind {
    Read,
    Entry,
    Match,
}
struct Budget {
    since: Instant,
    touched: Instant,
    all: u32,
    entries: u32,
    matches: u32,
}
#[derive(Default)]
pub struct Limiter(Mutex<HashMap<Uuid, Budget>>);
impl Limiter {
    pub fn check(&self, user: Uuid, kind: Kind) -> Result<()> {
        let mut table = self.0.lock().map_err(|_| LeagueError::unavailable())?;
        let now = Instant::now();
        table.retain(|_, b| now.duration_since(b.touched) < Duration::from_secs(600));
        let b = table.entry(user).or_insert(Budget {
            since: now,
            touched: now,
            all: 0,
            entries: 0,
            matches: 0,
        });
        if now.duration_since(b.since) >= Duration::from_secs(60) {
            *b = Budget {
                since: now,
                touched: now,
                all: 0,
                entries: 0,
                matches: 0,
            };
        }
        b.touched = now;
        b.all = b.all.saturating_add(1);
        match kind {
            Kind::Entry => b.entries = b.entries.saturating_add(1),
            Kind::Match => b.matches = b.matches.saturating_add(1),
            Kind::Read => (),
        }
        if b.all > 30 || b.entries > 3 || b.matches > 6 {
            return Err(LeagueError::new(429, "LEAGUE_RATE_LIMITED"));
        }
        Ok(())
    }
}
