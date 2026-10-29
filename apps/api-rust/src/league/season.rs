use super::{
    League,
    error::{LeagueError, Result},
    store::{NextSeason, StarterSource},
};
use serde_json::{Value, json};
use std::{
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};
use tokio::time::MissedTickBehavior;

pub fn spawn(league: &Arc<League>) {
    let pool = starter_pool();
    let _ = dev_minutes();
    let league = Arc::clone(league);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
        let (mut missing, mut waiting, mut no_pool) = (None, None, None);
        loop {
            interval.tick().await;
            if let Err(error) = tick(&league, &pool, &mut missing, &mut waiting, &mut no_pool).await
            {
                tracing::warn!(event = "league.season_tick_failed", code = error.code);
            }
        }
    });
}

fn starter_pool() -> Vec<i16> {
    let raw = match std::env::var("LEAGUE_STARTER_POOL") {
        Ok(raw) if raw.trim().is_empty() => return Vec::new(),
        Ok(raw) => raw,
        Err(std::env::VarError::NotPresent) => return Vec::new(),
        Err(_) => {
            tracing::warn!(event = "league.starter_pool_invalid", reason = "encoding");
            return Vec::new();
        }
    };
    let Ok(mut pool) = raw
        .split(',')
        .map(|s| s.trim().parse::<i16>())
        .collect::<std::result::Result<Vec<_>, _>>()
    else {
        tracing::warn!(event = "league.starter_pool_invalid", reason = "integer");
        return Vec::new();
    };
    let count = pool.len();
    pool.sort_unstable();
    pool.dedup();
    if !(3..=60).contains(&count)
        || pool.len() != count
        || pool.iter().any(|id| !(1..=493).contains(id))
    {
        tracing::warn!(
            event = "league.starter_pool_invalid",
            reason = "size_range_or_duplicate"
        );
        return Vec::new();
    }
    pool
}

fn due(last: &mut Option<Instant>, seconds: u64) -> bool {
    if last.is_some_and(|at| at.elapsed() < Duration::from_secs(seconds)) {
        return false;
    }
    *last = Some(Instant::now());
    true
}

async fn tick(
    league: &League,
    pool: &[i16],
    missing: &mut Option<Instant>,
    waiting: &mut Option<Instant>,
    no_pool: &mut Option<Instant>,
) -> Result<()> {
    let snapshot = {
        let slot = league.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let season = client.query_opt("SELECT id,starter_species_ids,(extract(epoch FROM closes_at-now())*1000)::bigint AS until_close,now()<settle_deadline AS before_deadline FROM poke_lounge_league_season WHERE settled_at IS NULL", &[]).await?;
        match season {
            None => None,
            Some(season) => {
                let id: i32 = season.try_get("id")?;
                let next_id = id.checked_add(1).ok_or_else(LeagueError::corrupt)?;
                let previous: Vec<i16> = season.try_get("starter_species_ids")?;
                let until_close: i64 = season.try_get("until_close")?;
                let before_deadline: bool = season.try_get("before_deadline")?;
                let plan = client.query_opt("SELECT to_jsonb(p) FROM poke_lounge_league_season_plan p WHERE season_id=$1", &[&next_id]).await?.map(|row| row.try_get::<_, Value>(0)).transpose()?;
                let active: i64 = if until_close <= 0 {
                    client.query_one("SELECT count(*) FROM poke_lounge_league_attempt WHERE season_id=$1 AND status='active'", &[&id]).await?.try_get(0)?
                } else {
                    0
                };
                Some((
                    id,
                    next_id,
                    previous,
                    until_close,
                    before_deadline,
                    plan,
                    active,
                ))
            }
        }
    };
    let Some((id, next_id, previous, until_close, before_deadline, plan, active)) = snapshot else {
        return league.bootstrap().await;
    };
    if until_close > 0 {
        if until_close <= 72 * 60 * 60 * 1000 && plan.is_none() && due(missing, 3600) {
            tracing::warn!(
                event = "league.season_plan_missing",
                season = id,
                next_id,
                hours_to_close = until_close / 3_600_000,
                pool_available = pool.len() >= 3
            );
        }
        return Ok(());
    }
    if active > 0 && before_deadline {
        if due(waiting, 600) {
            tracing::info!(event = "league.settle_waiting", season = id, active);
        }
        return Ok(());
    }
    let (starters, level, source, excluded_previous) = if let Some(plan) = plan {
        let Some((ids, level)) = valid_plan(&plan) else {
            tracing::warn!(
                event = "league.season_plan_invalid",
                next_id,
                reason = "starters_or_level"
            );
            return Ok(());
        };
        (ids, level, StarterSource::Plan, false)
    } else {
        if pool.len() < 3 {
            if due(no_pool, 600) {
                tracing::warn!(
                    event = "league.season_plan_missing",
                    season = id,
                    next_id,
                    hours_to_close = until_close / 3_600_000,
                    pool_available = false
                );
            }
            return Ok(());
        }
        let seed = rand::random::<i64>();
        let (ids, excluded) = select_starters(pool, &previous, seed);
        (
            ids,
            league.config.starter_level,
            StarterSource::Pool { seed },
            excluded,
        )
    };
    let prepared = async {
        let health = league.judge.health().await?;
        let roster = league
            .judge
            .call(&health.engine, json!({"kind":"season-roster"}))
            .await?;
        if roster["rosterVersion"] != health.roster {
            return Err(LeagueError::corrupt());
        }
        Ok(NextSeason {
            starter_species_ids: starters,
            starter_level: level,
            starter_source: source,
            rules_version: league.config.rules_version,
            engine_version: health.engine,
            roster_version: health.roster,
            npc_seeds: roster["npcSeeds"].clone(),
            badge_npcs: roster["badgeNpcs"].clone(),
        })
    }
    .await;
    let next = match prepared {
        Ok(next) => next,
        Err(error) => {
            if error.code != "LEAGUE_CORRUPT" {
                tracing::warn!(
                    event = "league.settle_judge_unavailable",
                    season = id,
                    code = error.code
                );
            }
            return Err(error);
        }
    };
    if league.settle_season(id, &next).await?
        && let StarterSource::Pool { seed } = next.starter_source
    {
        tracing::info!(event = "league.season_starters_from_pool", next_id, seed, species = ?next.starter_species_ids, pool_size = pool.len(), excluded_previous);
    }
    Ok(())
}

fn valid_plan(plan: &Value) -> Option<(Vec<i16>, i16)> {
    let ids: Vec<i16> = plan["starter_species_ids"]
        .as_array()?
        .iter()
        .map(|id| i16::try_from(id.as_i64()?).ok())
        .collect::<Option<_>>()?;
    let level = i16::try_from(plan["starter_level"].as_i64()?).ok()?;
    let mut unique = ids.clone();
    unique.sort_unstable();
    unique.dedup();
    ((3..=6).contains(&ids.len())
        && unique.len() == ids.len()
        && ids.iter().all(|id| (1..=493).contains(id))
        && (1..=100).contains(&level))
    .then_some((ids, level))
}

fn select_starters(pool: &[i16], previous: &[i16], seed: i64) -> (Vec<i16>, bool) {
    let mut candidates: Vec<_> = pool
        .iter()
        .copied()
        .filter(|id| !previous.contains(id))
        .collect();
    let excluded = candidates.len() >= 3;
    if !excluded {
        candidates = pool.to_vec();
    }
    candidates.sort_unstable();
    let mut state = seed as u64;
    for i in (1..candidates.len()).rev() {
        // SplitMix64 and Fisher–Yates are also documented for operator reproduction.
        state = state.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^= z >> 31;
        candidates.swap(i, (z % (i as u64 + 1)) as usize);
    }
    candidates.truncate(3);
    candidates.sort_unstable();
    (candidates, excluded)
}

pub(super) fn dev_minutes() -> Option<i32> {
    static MINUTES: OnceLock<Option<i32>> = OnceLock::new();
    *MINUTES.get_or_init(|| {
        let raw = match std::env::var("LEAGUE_DEV_SEASON_MINUTES") {
            Ok(raw) if raw.trim().is_empty() => return None,
            Ok(raw) => raw,
            Err(std::env::VarError::NotPresent) => return None,
            Err(_) => {
                tracing::warn!(event = "league.dev_season_invalid", reason = "encoding");
                return None;
            }
        };
        match raw.trim().parse::<i32>() {
            Ok(minutes) if (10..=10080).contains(&minutes) => {
                tracing::warn!(event = "league.dev_season_override", minutes);
                Some(minutes)
            }
            _ => {
                tracing::warn!(
                    event = "league.dev_season_invalid",
                    reason = "integer_or_range"
                );
                None
            }
        }
    })
}

pub(super) fn timing(grace_hours: i32) -> (i32, i32, i32) {
    match dev_minutes() {
        Some(minutes) => (minutes, (minutes / 10).max(1), (minutes / 10).max(1)),
        None => (27 * 24 * 60 + 18 * 60, 6 * 60, grace_hours * 60),
    }
}
