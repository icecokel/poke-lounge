use super::{
    error::{LeagueError, Result},
    views,
};
use serde_json::{Value, json};
use tokio_postgres::GenericClient;
use uuid::Uuid;

pub struct Standing {
    pub user: Option<Uuid>,
    pub meta: Value,
    pub score: i32,
    pub public_party: Value,
    pub composition: Value,
}
impl Standing {
    pub fn view(&self) -> Value {
        let mut view = self.meta.clone();
        view["score"] = json!(self.score);
        view["publicParty"] = self.public_party.clone();
        view
    }
}
pub async fn top<C: GenericClient + Sync>(client: &C, season: &Value) -> Result<Vec<Standing>> {
    let id = views::integer(&season["id"])? as i32;
    let rows = client.query("SELECT user_id,display_name,score,public_party,composition FROM poke_lounge_league_record WHERE season_id=$1 ORDER BY score DESC,accept_seq ASC LIMIT 5", &[&id]).await?;
    let mut entries = Vec::new();
    for row in rows {
        let name: String = row.try_get("display_name")?;
        let composition: Value = row.try_get("composition")?;
        let public_party: Value = row.try_get("public_party")?;
        if !composition.is_object() || !public_party.is_array() {
            return Err(LeagueError::corrupt());
        }
        entries.push(Standing {
            user: Some(row.try_get("user_id")?),
            meta: json!({"kind":"player","position":entries.len()+1,"displayName":name}),
            score: row.try_get("score")?,
            public_party,
            composition,
        });
    }
    let mut npcs = views::array(&season["npc_seeds"])?.clone();
    if npcs.len() != 5 {
        return Err(LeagueError::corrupt());
    }
    for npc in &npcs {
        views::integer(&npc["order"])?;
    }
    npcs.sort_by_key(|npc| npc["order"].as_i64());
    for npc in npcs.into_iter().take(5 - entries.len()) {
        if !npc["composition"].is_object() || !npc["publicParty"].is_array() {
            return Err(LeagueError::corrupt());
        }
        entries.push(Standing { user: None, meta: json!({"kind":"npc","position":entries.len()+1,"displayName":views::text(&npc["displayName"])?,"npcKey":views::text(&npc["npcKey"])?}), score: 0, public_party: npc["publicParty"].clone(), composition: npc["composition"].clone() });
    }
    Ok(entries)
}
