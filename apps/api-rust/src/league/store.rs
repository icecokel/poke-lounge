use super::{
    League,
    error::{LeagueError, Result},
    standings, views,
};
use serde_json::{Value, json};
use tokio_postgres::{GenericClient, types::ToSql};
use uuid::Uuid;

const SEASON: &str = "SELECT to_jsonb(s) || jsonb_build_object('starts_ms',(extract(epoch from starts_at)*1000)::bigint,'closes_ms',(extract(epoch from closes_at)*1000)::bigint,'deadline_ms',(extract(epoch from settle_deadline)*1000)::bigint,'now_ms',(extract(epoch from now())*1000)::bigint) AS value FROM poke_lounge_league_season s";
const RUN: &str = "SELECT to_jsonb(r) || jsonb_build_object('created_ms',(extract(epoch from created_at)*1000)::bigint) AS value FROM poke_lounge_league_run r";
const ATTEMPT: &str = "SELECT to_jsonb(a) || jsonb_build_object('entered_ms',(extract(epoch from entered_at)*1000)::bigint,'updated_ms',(extract(epoch from updated_at)*1000)::bigint) AS value FROM poke_lounge_league_attempt a";
async fn one<C: GenericClient + Sync>(
    client: &C,
    sql: &str,
    params: &[&(dyn ToSql + Sync)],
) -> Result<Option<Value>> {
    client
        .query_opt(sql, params)
        .await?
        .map(|r| r.try_get("value").map_err(LeagueError::from))
        .transpose()
}
async fn season<C: GenericClient + Sync>(client: &C) -> Result<Option<Value>> {
    one(
        client,
        &format!("{SEASON} ORDER BY (settled_at IS NULL) DESC,id DESC LIMIT 1"),
        &[],
    )
    .await
}
async fn season_id<C: GenericClient + Sync>(client: &C, id: i32, lock: &str) -> Result<Value> {
    one(client, &format!("{SEASON} WHERE id=$1 {lock}"), &[&id])
        .await?
        .ok_or_else(LeagueError::corrupt)
}
async fn now<C: GenericClient + Sync>(client: &C) -> Result<i64> {
    Ok(client
        .query_one("SELECT (extract(epoch from now())*1000)::bigint", &[])
        .await?
        .try_get(0)?)
}
impl League {
    async fn bootstrap(&self) -> Result<()> {
        let (Some(starts), Some(starters)) = (&self.config.starts_at, &self.config.starters) else {
            return Ok(());
        };
        let health = self.judge.health().await?;
        let roster = match self
            .judge
            .call(&health.engine, json!({"kind":"season-roster"}))
            .await
        {
            Err(e) if e.code == "LEAGUE_ROSTER_NOT_READY" => return Ok(()),
            result => result?,
        };
        if roster["rosterVersion"] != health.roster
            || views::array(&roster["npcSeeds"])?.len() != 5
            || views::array(&roster["badgeNpcs"])?.len() != 8
        {
            return Err(LeagueError::corrupt());
        }
        let mut orders = views::array(&roster["npcSeeds"])?
            .iter()
            .map(|npc| views::integer(&npc["order"]))
            .collect::<Result<Vec<_>>>()?;
        orders.sort_unstable();
        if orders != [1, 2, 3, 4, 5] {
            return Err(LeagueError::corrupt());
        }
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        client.execute("INSERT INTO poke_lounge_league_season (id,starts_at,closes_at,settle_deadline,starter_species_ids,starter_level,rules_version,engine_version,roster_version,npc_seeds,badge_npcs) SELECT 1,$1::text::timestamptz,$1::text::timestamptz+interval '28 days',$1::text::timestamptz+interval '28 days'+make_interval(hours=>$2),$3,$4,$5,$6,$7,$8,$9 WHERE NOT EXISTS (SELECT 1 FROM poke_lounge_league_season) ON CONFLICT DO NOTHING", &[starts,&self.config.grace_hours,starters,&self.config.starter_level,&self.config.rules_version,&health.engine,&health.roster,&roster["npcSeeds"],&roster["badgeNpcs"]]).await?;
        Ok(())
    }
    pub async fn status(&self) -> Result<Value> {
        let initial = {
            let slot = self.db.client().await?;
            season(slot.as_ref().ok_or_else(LeagueError::unavailable)?).await?
        };
        if initial.is_none() {
            self.bootstrap().await?;
        }
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let season = season(client).await?;
        Ok(
            json!({"enabled":true,"contractVersion":1,"engineVersion":season.as_ref().map(|s| &s["engine_version"]),"rulesVersion":self.config.rules_version,"nowMs":now(client).await?,"season":season.as_ref().map(views::season).transpose()?}),
        )
    }
    pub async fn standings(&self) -> Result<Value> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client
            .build_transaction()
            .isolation_level(tokio_postgres::IsolationLevel::RepeatableRead)
            .start()
            .await?;
        let Some(s) = season(&tx).await? else {
            return Ok(json!({"seasonId":null,"rev":0,"entries":[]}));
        };
        let entries = standings::top(&tx, &s)
            .await?
            .iter()
            .map(|e| e.view())
            .collect::<Vec<_>>();
        tx.commit().await?;
        Ok(json!({"seasonId":s["id"],"rev":s["standings_rev"],"entries":entries}))
    }
    pub async fn hall_of_fame(&self, id: Option<i32>) -> Result<Value> {
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let rows = client.query("SELECT season_id,jsonb_agg(jsonb_strip_nulls(jsonb_build_object('position',position,'kind',kind,'displayName',display_name,'score',score,'npcKey',npc_key,'publicParty',public_party)) ORDER BY position) AS entries FROM poke_lounge_league_hall_of_fame WHERE ($1::integer IS NULL OR season_id=$1) GROUP BY season_id ORDER BY season_id DESC", &[&id]).await?;
        let seasons = rows.iter().map(|r| -> Result<Value> { Ok(json!({"seasonId":r.try_get::<_,i32>("season_id")?,"entries":r.try_get::<_,Value>("entries")?})) }).collect::<Result<Vec<_>>>()?;
        Ok(json!({"seasons":seasons}))
    }
    pub async fn me(&self, user: Uuid, name: &str) -> Result<Value> {
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let Some(s) = season(client).await? else {
            return Ok(json!({"user":{"displayName":name},"run":null,"attempt":null,"best":null}));
        };
        let id = views::integer(&s["id"])? as i32;
        let run = one(
            client,
            &format!("{RUN} WHERE season_id=$1 AND user_id=$2 AND status<>'closed'"),
            &[&id, &user],
        )
        .await?;
        let attempt = one(
            client,
            &format!("{ATTEMPT} WHERE season_id=$1 AND user_id=$2 AND status='active'"),
            &[&id, &user],
        )
        .await?;
        let best = one(client, "SELECT jsonb_build_object('score',score,'bestRank',best_rank,'recordedAtMs',(extract(epoch from recorded_at)*1000)::bigint) AS value FROM poke_lounge_league_record WHERE season_id=$1 AND user_id=$2", &[&id,&user]).await?;
        Ok(
            json!({"user":{"displayName":name},"run":run.as_ref().map(views::run),"attempt":attempt.as_ref().map(views::summary),"best":best}),
        )
    }
    pub async fn personal_seasons(&self, user: Uuid) -> Result<Value> {
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let rows = client.query("SELECT jsonb_build_object('seasonId',season_id,'bestScore',score,'bestRank',best_rank,'finalRank',final_rank) AS value FROM poke_lounge_league_record WHERE user_id=$1 ORDER BY season_id DESC", &[&user]).await?;
        let seasons = rows
            .iter()
            .map(|r| r.try_get::<_, Value>("value"))
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(json!({"seasons":seasons}))
    }
}
