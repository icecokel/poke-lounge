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
