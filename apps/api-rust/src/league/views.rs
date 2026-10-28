use super::error::{LeagueError, Result};
use serde_json::{Value, json};
use uuid::Uuid;

pub fn integer(value: &Value) -> Result<i64> {
    value.as_i64().ok_or_else(LeagueError::corrupt)
}
pub fn text(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(LeagueError::corrupt)
}
pub fn uuid(value: &Value) -> Result<Uuid> {
    Uuid::parse_str(text(value)?).map_err(|_| LeagueError::corrupt())
}
pub fn array(value: &Value) -> Result<&Vec<Value>> {
    value.as_array().ok_or_else(LeagueError::corrupt)
}
pub fn hash(value: &Value, len: usize) -> bool {
    value.as_str().is_some_and(|s| {
        s.len() == len
            && s.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}
pub fn season(s: &Value) -> Result<Value> {
    let now = integer(&s["now_ms"])?;
    let starts = integer(&s["starts_ms"])?;
    let closes = integer(&s["closes_ms"])?;
    let phase = if !s["settled_at"].is_null() {
        "settled"
    } else if now < starts {
        "scheduled"
    } else if now < closes {
        "open"
    } else {
        "closing"
    };
    Ok(
        json!({"id":s["id"],"phase":phase,"startsAtMs":starts,"closesAtMs":closes,"settleDeadlineMs":s["deadline_ms"],"starterSpeciesIds":s["starter_species_ids"],"starterLevel":s["starter_level"]}),
    )
}
pub fn run(r: &Value) -> Value {
    json!({"id":r["id"],"status":r["status"],"starterSpeciesId":r["starter_species_id"],"badges":r["badges"],"createdAtMs":r["created_ms"]})
}
pub fn summary(a: &Value) -> Value {
    json!({"id":a["id"],"status":a["status"],"currentMatch":a["current_match"],"enteredAtMs":a["entered_ms"],"updatedAtMs":a["updated_ms"],"score":a["score"],"failReason":a["fail_reason"]})
}
pub fn current(a: &Value) -> Result<Value> {
    let index = integer(&a["current_match"])? as usize;
    let seed = array(&a["match_seeds"])?
        .get(index)
        .ok_or_else(LeagueError::corrupt)?;
    if array(seed)?.len() != 4
        || !array(seed)?
            .iter()
            .all(|n| n.as_u64().is_some_and(|n| n <= 65535))
        || !hash(&a["carry_hash"], 16)
        || !a["carry_party"].is_object()
    {
        return Err(LeagueError::corrupt());
    }
    Ok(json!({"index":index,"seed":seed,"carryParty":a["carry_party"],"carryHash":a["carry_hash"]}))
}
pub fn public_party(composition: &Value) -> Result<Value> {
    let mut members = array(&composition["members"])?.clone();
    if members.len() != 6 {
        return Err(LeagueError::corrupt());
    }
    for member in &members {
        integer(&member["slotIndex"])?;
    }
    members.sort_by_key(|m| m["slotIndex"].as_i64());
    let party = members.iter().map(|m| -> Result<Value> { Ok(json!({"speciesId":integer(&m["speciesId"])?,"level":integer(&m["level"])?.min(50),"moveIds":array(&m["moves"])?.iter().map(|v| integer(&v["moveId"])).collect::<Result<Vec<_>>>()?})) }).collect::<Result<Vec<_>>>()?;
    Ok(json!(party))
}

pub fn validate_claim(claim: &Value) -> Result<()> {
    let valid = || -> Option<()> {
        if claim["version"] != 1 {
            return None;
        }
        let members = claim["members"].as_array()?;
        if members.len() != 6 {
            return None;
        }
        let mut slots = std::collections::HashSet::new();
        let mut mons = std::collections::HashSet::new();
        for member in members {
            let slot = member["slotIndex"].as_u64().filter(|n| *n < 6)?;
            let mon = Uuid::parse_str(member["monId"].as_str()?).ok()?;
            if !slots.insert(slot) || !mons.insert(mon) {
                return None;
            }
            for (key, min, max) in [
                ("speciesId", 1, 493),
                ("level", 1, 100),
                ("happiness", 0, 255),
                ("experience", 0, 9_007_199_254_740_991),
            ] {
                member[key].as_u64().filter(|n| (min..=max).contains(n))?;
            }
            let evs = &member["effortValues"];
            let mut total = 0;
            for key in [
                "hp",
                "attack",
                "defense",
                "specialAttack",
                "specialDefense",
                "speed",
            ] {
                total += evs[key].as_u64().filter(|n| *n <= 255)?;
            }
            if total > 510 {
                return None;
            }
            let moves = member["moveIds"].as_array()?;
            if !(1..=4).contains(&moves.len()) {
                return None;
            }
            let mut ids = std::collections::HashSet::new();
            for id in moves {
                if !ids.insert(id.as_u64().filter(|n| (1..=467).contains(n))?) {
                    return None;
                }
            }
        }
        if !slots.contains(&claim["leadSlot"].as_u64()?) {
            return None;
        }
        Some(())
    };
    valid().ok_or_else(|| {
        LeagueError::new(422, "LEAGUE_PARTY_INVALID")
            .detail(json!({"reasons":["Invalid six-member party claim"]}))
    })
}

pub fn validate_submission(s: &Value) -> Result<()> {
    let valid = || -> Option<()> {
        if s["contractVersion"] != 1 {
            return None;
        }
        s["engineVersion"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 96)?;
        s["leadSlot"].as_u64().filter(|n| *n < 6)?;
        if !hash(&s["startHash"], 16) || !hash(&s["client"]["endHash"], 16) {
            return None;
        }
        s["client"]["turns"]
            .as_u64()
            .filter(|n| *n <= 9_007_199_254_740_991)?;
        if !s["client"]["winner"].is_null()
            && s["client"]["winner"] != 0
            && s["client"]["winner"] != 1
        {
            return None;
        }
        let inputs = s["inputs"].as_array()?;
        if inputs.len() > 1000 {
            return None;
        }
        for input in inputs {
            let pair = input.as_array()?;
            if pair.len() != 2 {
                return None;
            }
            let n = pair[1].as_u64()?;
            match pair[0].as_str()? {
                "m" if (1..=467).contains(&n) => (),
                "s" if n < 6 => (),
                _ => return None,
            }
        }
        Some(())
    };
    valid().ok_or_else(|| {
        LeagueError::new(422, "LEAGUE_INPUT_REJECTED")
            .detail(json!({"kind":"ILLEGAL_INPUT","at":0}))
    })
}
