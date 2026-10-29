use super::error::{LeagueError, Result};
use std::{
    collections::HashMap,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub(super) fn first_this_second(slot: &AtomicU64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs());
    slot.fetch_max(now, Ordering::Relaxed) < now
}

#[derive(Clone, Copy)]
pub enum Kind {
    Read,
    Growth,
    Mint,
    Badge,
    Save,
    Entry,
    Match,
}
struct Budget {
    since: Instant,
    touched: Instant,
    all: u32,
    entries: u32,
    matches: u32,
    growth: [u32; 4],
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
            growth: [0; 4],
        });
        if now.duration_since(b.since) >= Duration::from_secs(60) {
            *b = Budget {
                since: now,
                touched: now,
                all: 0,
                entries: 0,
                matches: 0,
                growth: [0; 4],
            };
        }
        b.touched = now;
        b.all = b.all.saturating_add(1);
        match kind {
            Kind::Entry => b.entries = b.entries.saturating_add(1),
            Kind::Match => b.matches = b.matches.saturating_add(1),
            Kind::Growth => b.growth[0] = b.growth[0].saturating_add(1),
            Kind::Badge => b.growth[2] = b.growth[2].saturating_add(1),
            Kind::Mint => b.growth[1] = b.growth[1].saturating_add(1),
            Kind::Save => b.growth[3] = b.growth[3].saturating_add(1),
            Kind::Read => (),
        }
        if b.growth
            .iter()
            .zip([6, 12, 8, 4])
            .any(|(used, max)| *used > max)
            || b.all > 30
            || (matches!(kind, Kind::Entry) && b.entries > 3)
            || (matches!(kind, Kind::Match) && b.matches > 6)
        {
            return Err(LeagueError::new(429, "LEAGUE_RATE_LIMITED"));
        }
        Ok(())
    }
}
