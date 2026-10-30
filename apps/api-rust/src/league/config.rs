use super::test_mode::TestConfig;
use std::{env, fs};

pub struct Config {
    pub test: Option<TestConfig>,
    pub exp_multiplier_permille: i32,
    pub judge_url: reqwest::Url,
    pub token: String,
    pub db_max: usize,
    pub grace_hours: i32,
    pub starts_at: Option<String>,
    pub starters: Option<Vec<i16>>,
    pub starter_level: i16,
    pub rules_version: i16,
}
impl Config {
    pub fn from_env() -> Result<Self, &'static str> {
        let judge_url =
            optional("LEAGUE_JUDGE_URL")?.unwrap_or_else(|| "http://127.0.0.1:3031".into());
        let judge_url = reqwest::Url::parse(&judge_url).map_err(|_| "LEAGUE_JUDGE_URL")?;
        if !matches!(judge_url.scheme(), "http" | "https")
            || judge_url.host_str().is_none()
            || !judge_url.username().is_empty()
            || judge_url.password().is_some()
            || judge_url.query().is_some()
            || judge_url.fragment().is_some()
            || judge_url.path() != "/"
        {
            return Err("LEAGUE_JUDGE_URL");
        }
        let token =
            secret("LEAGUE_JUDGE_TOKEN", "LEAGUE_JUDGE_TOKEN_FILE").ok_or("LEAGUE_JUDGE_TOKEN")?;
        if !(32..=256).contains(&token.len()) || !token.bytes().all(|b| (32..=126).contains(&b)) {
            return Err("LEAGUE_JUDGE_TOKEN");
        }
        let worker = secret("BATTLE_WORKER_TOKEN", "BATTLE_WORKER_TOKEN_FILE").or_else(|| {
            fs::read_to_string("/run/poke-private/token")
                .ok()
                .map(|s| s.trim().to_owned())
        });
        if worker.as_deref() == Some(&token) {
            return Err("LEAGUE_JUDGE_TOKEN");
        }
        let starts_at = optional("LEAGUE_SEASON1_STARTS_AT")?;
        if starts_at.as_deref().is_some_and(|s| !rfc3339(s)) {
            return Err("LEAGUE_SEASON1_STARTS_AT");
        }
        let starters = optional("LEAGUE_SEASON1_STARTERS")?
            .map(|s| {
                s.split(',')
                    .map(|v| v.trim().parse::<i16>())
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()
            .map_err(|_| "LEAGUE_SEASON1_STARTERS")?;
        if let Some(ids) = &starters {
            let mut unique = ids.clone();
            unique.sort_unstable();
            unique.dedup();
            if !(3..=6).contains(&ids.len())
                || unique.len() != ids.len()
                || ids.iter().any(|id| !(1..=493).contains(id))
            {
                return Err("LEAGUE_SEASON1_STARTERS");
            }
        }
        let exp_multiplier_permille = match optional("LEAGUE_EXP_MULTIPLIER").ok().flatten() {
            None => 1500,
            Some(value) => match value.trim().parse::<f64>() {
                Ok(n) if n.is_finite() && (1.0..=20.0).contains(&n) => (n * 1000.0).round() as i32,
                _ => {
                    tracing::warn!(
                        event = "league.growth_config_invalid",
                        key = "LEAGUE_EXP_MULTIPLIER"
                    );
                    1500
                }
            },
        };
        let test = TestConfig::from_env()?;
        let config = Self {
            exp_multiplier_permille,
            judge_url,
            token,
            db_max: number("LEAGUE_DB_MAX_CONNECTIONS", 2, 1, 4)? as usize,
            grace_hours: number("LEAGUE_SETTLE_GRACE_HOURS", 6, 0, 720)?,
            starts_at,
            starters,
            starter_level: test
                .as_ref()
                .and_then(|t| t.starter_level)
                .unwrap_or(number("LEAGUE_SEASON1_STARTER_LEVEL", 10, 1, 100)? as i16),
            rules_version: number("LEAGUE_RULES_VERSION", 1, 1, 1)? as i16,
            test,
        };
        if let Some(test) = &config.test {
            tracing::warn!(
                event = "league.test_mode_on",
                marker = %test.marker(),
                accounts = test.accounts,
                login = test.login_token.is_some(),
                badges_required = config.badges_required(),
            );
        }
        Ok(config)
    }
}
fn secret(key: &'static str, file: &'static str) -> Option<String> {
    optional(key)
        .ok()
        .flatten()
        .or_else(|| {
            optional(file)
                .ok()
                .flatten()
                .and_then(|p| fs::read_to_string(p).ok())
        })
        .map(|s| s.trim().to_owned())
}
fn number(key: &'static str, default: i32, min: i32, max: i32) -> Result<i32, &'static str> {
    let value = match optional(key)? {
        Some(v) => v.parse().map_err(|_| key)?,
        None => default,
    };
    if !(min..=max).contains(&value) {
        return Err(key);
    }
    Ok(value)
}
// Validate without opening a DB connection or adding a date dependency.
pub(super) fn rfc3339(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 20
        || !s.is_ascii()
        || b[4] != b'-'
        || b[7] != b'-'
        || !matches!(b[10], b'T' | b't')
        || b[13] != b':'
        || b[16] != b':'
    {
        return false;
    }
    let n = |a: usize, z: usize| {
        let value = &s[a..z];
        value
            .bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| value.parse::<u32>().ok())
            .flatten()
    };
    let (Some(y), Some(m), Some(d), Some(h), Some(min), Some(sec)) =
        (n(0, 4), n(5, 7), n(8, 10), n(11, 13), n(14, 16), n(17, 19))
    else {
        return false;
    };
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => return false,
    };
    if y == 0 || d == 0 || d > days || h > 23 || min > 59 || sec > 59 {
        return false;
    }
    let mut i = 19;
    if b[i] == b'.' {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    if i + 1 == b.len() && matches!(b[i], b'Z' | b'z') {
        return true;
    }
    i + 6 == b.len()
        && matches!(b[i], b'+' | b'-')
        && b[i + 3] == b':'
        && n(i + 1, i + 3).is_some_and(|n| n <= 23)
        && n(i + 4, i + 6).is_some_and(|n| n <= 59)
}

fn optional(key: &'static str) -> Result<Option<String>, &'static str> {
    match env::var(key) {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(_) => Err(key),
    }
}
