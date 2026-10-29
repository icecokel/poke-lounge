use super::super::{
    League,
    error::{LeagueError, Result},
};
use serde_json::{Value, json};
use uuid::Uuid;

pub async fn get(league: &League, user: Uuid) -> Result<Value> {
    let slot = league.db.client().await?;
    let row = slot.as_ref().ok_or_else(LeagueError::unavailable)?.query_opt("SELECT nickname,(extract(epoch from updated_at + interval '7 days')*1000)::bigint AS changeable FROM poke_lounge_league_profile WHERE user_id=$1", &[&user]).await?;
    Ok(match row {
        Some(row) => {
            json!({"nickname":row.try_get::<_,String>("nickname")?,"changeableAtMs":row.try_get::<_,i64>("changeable")?})
        }
        None => json!({"nickname":null,"changeableAtMs":null}),
    })
}
pub async fn display_name(league: &League, user: Uuid, fallback: &str) -> Result<String> {
    Ok(get(league, user).await?["nickname"]
        .as_str()
        .unwrap_or(fallback)
        .to_owned())
}
pub async fn set_nickname(league: &League, user: Uuid, nickname: &str) -> Result<Value> {
    let mut reasons = Vec::new();
    if !(2..=12).contains(&nickname.chars().count()) {
        reasons.push("LENGTH");
    }
    if !nickname.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || c == '_'
            || ('\u{ac00}'..='\u{d7a3}').contains(&c)
            || ('\u{3041}'..='\u{3096}').contains(&c)
            || ('\u{30a1}'..='\u{30fa}').contains(&c)
            || c == '\u{30fc}'
    }) {
        reasons.push("CHARACTERS");
    }
    let key = nickname.to_ascii_lowercase();
    let slot = league.db.client().await?;
    let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
    if [
        "목호",
        "카렌",
        "시바",
        "독수",
        "일목",
        "비상",
        "호일",
        "꼭두",
        "유빈",
        "사도",
        "규리",
        "류옹",
        "이향",
        "npc",
        "운영자",
        "관리자",
        "admin",
        "system",
    ]
    .contains(&key.as_str())
    {
        reasons.push("RESERVED");
    }
    if !reasons.is_empty() {
        return Err(
            LeagueError::new(422, "LEAGUE_NICKNAME_INVALID").detail(json!({"reasons":reasons}))
        );
    }
    let result = client.query_opt("INSERT INTO poke_lounge_league_profile (user_id,nickname,nickname_key) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET nickname=$2,nickname_key=$3,updated_at=now() WHERE poke_lounge_league_profile.updated_at <= now()-interval '7 days' RETURNING nickname,(extract(epoch from updated_at+interval '7 days')*1000)::bigint AS changeable", &[&user,&nickname,&key]).await;
    match result {
        Ok(Some(row)) => Ok(
            json!({"nickname":row.try_get::<_,String>("nickname")?,"changeableAtMs":row.try_get::<_,i64>("changeable")?}),
        ),
        Ok(None) => {
            drop(slot);
            let profile = get(league, user).await?;
            Err(LeagueError::new(409, "LEAGUE_NICKNAME_COOLDOWN")
                .detail(json!({"changeableAtMs":profile["changeableAtMs"]})))
        }
        Err(e)
            if e.as_db_error().and_then(|e| e.constraint())
                == Some("UQ_poke_lounge_league_profile_nickname") =>
        {
            Err(LeagueError::new(409, "LEAGUE_NICKNAME_TAKEN"))
        }
        Err(e) => Err(e.into()),
    }
}
