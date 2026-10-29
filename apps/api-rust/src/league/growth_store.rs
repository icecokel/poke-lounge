use super::super::{
    League, db,
    error::{LeagueError, Result},
    views,
};
use serde_json::{Value, json};
use tokio_postgres::{GenericClient, types::ToSql};
use uuid::Uuid;

const RUN: &str = "SELECT to_jsonb(r)||jsonb_build_object('created_ms',(extract(epoch from created_at)*1000)::bigint,'now_ms',(extract(epoch from now())*1000)::bigint) AS value FROM poke_lounge_league_run r";
const SEASON: &str = "SELECT to_jsonb(s)||jsonb_build_object('starts_ms',(extract(epoch from starts_at)*1000)::bigint,'closes_ms',(extract(epoch from closes_at)*1000)::bigint,'deadline_ms',(extract(epoch from settle_deadline)*1000)::bigint,'now_ms',(extract(epoch from now())*1000)::bigint) AS value FROM poke_lounge_league_season s";
async fn one<C: GenericClient + Sync>(
    c: &C,
    sql: &str,
    params: &[&(dyn ToSql + Sync)],
) -> Result<Option<Value>> {
    c.query_opt(sql, params)
        .await?
        .map(|r| r.try_get("value").map_err(LeagueError::from))
        .transpose()
}
async fn run<C: GenericClient + Sync>(c: &C, id: Uuid, user: Uuid, lock: &str) -> Result<Value> {
    one(
        c,
        &format!("{RUN} WHERE id=$1 AND user_id=$2 {lock}"),
        &[&id, &user],
    )
    .await?
    .ok_or_else(|| LeagueError::new(404, "LEAGUE_NOT_FOUND"))
}
async fn season<C: GenericClient + Sync>(c: &C, id: i32, lock: &str) -> Result<Value> {
    one(c, &format!("{SEASON} WHERE id=$1 {lock}"), &[&id])
        .await?
        .ok_or_else(LeagueError::corrupt)
}
fn open(s: &Value) -> Result<()> {
    if views::season(s)?["phase"] != "open" {
        return Err(LeagueError::new(409, "LEAGUE_SEASON_NOT_OPEN"));
    }
    Ok(())
}
fn active(r: &Value) -> Result<()> {
    if r["status"] != "active" {
        return Err(LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"));
    }
    Ok(())
}
fn retry_conflict() -> LeagueError {
    let mut e = LeagueError::unavailable();
    e.retry = true;
    e
}
fn growth(r: &Value) -> Value {
    r["checkpoint"]["growth"].clone()
}
fn context(r: &Value, s: &Value) -> Value {
    json!({"starterLevel":s["starter_level"],"createdAtMs":r["created_ms"]})
}
async fn mons<C: GenericClient + Sync>(c: &C, id: Uuid) -> Result<Vec<Value>> {
    let rows=c.query("SELECT jsonb_build_object('monId',id,'speciesId',species_id,'level',level,'individualValues',individual_values,'natureId',nature_id,'abilityId',ability_id,'gender',gender,'origin',origin,'mintedAtMs',(extract(epoch from minted_at)*1000)::bigint) AS value FROM poke_lounge_league_mon WHERE run_id=$1 ORDER BY minted_at,id", &[&id]).await?;
    rows.into_iter()
        .map(|r| r.try_get("value").map_err(LeagueError::from))
        .collect()
}
fn public_mon(mon: &Value) -> Value {
    let mut value = mon.clone();
    if let Some(o) = value.as_object_mut() {
        o.remove("origin");
        o.remove("mintedAtMs");
    }
    value
}
async fn insert_mon<C: GenericClient + Sync>(
    c: &C,
    run: Uuid,
    key: Uuid,
    origin: &str,
    mon: &Value,
) -> Result<()> {
    c.execute("INSERT INTO poke_lounge_league_mon (id,run_id,request_key,origin,species_id,level,individual_values,nature_id,ability_id,gender) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", &[&views::uuid(&mon["monId"])?,&run,&key,&origin,&(views::integer(&mon["speciesId"])? as i16),&(views::integer(&mon["level"])? as i16),&mon["individualValues"],&(views::integer(&mon["natureId"])? as i16),&(views::integer(&mon["abilityId"])? as i16),&views::text(&mon["gender"])?]).await?;
    Ok(())
}
async fn run_started<C: GenericClient + Sync>(c: &C, r: &Value) -> Result<Value> {
    let starter = mons(c, views::uuid(&r["id"])?)
        .await?
        .into_iter()
        .find(|m| m["origin"] == "starter")
        .ok_or_else(LeagueError::corrupt)?;
    Ok(json!({"run":views::run(r),"starter":public_mon(&starter),"growth":growth(r)}))
}
impl League {
    async fn mint_values(
        &self,
        origin: &str,
        species: i16,
        level: i16,
        r: &Value,
        s: &Value,
    ) -> Result<Value> {
        let health = self.judge.health().await?;
        let random: [u8; 32] = rand::random();
        let random = random
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        self.judge.call(&health.engine,json!({"kind":"mint","origin":origin,"speciesId":species,"level":level,"random":random,"run":context(r,s),"checkpoint":r["checkpoint"],"nowMs":r["now_ms"]})).await.map_err(|mut e| { if e.code=="LEAGUE_PARTY_IMPLAUSIBLE" { e.code="LEAGUE_MINT_REJECTED"; tracing::warn!(event="league.mint_rejected",run=?r["id"],reasons=?e.detail); } e })
    }
    pub async fn growth_start(&self, user: Uuid, species: i16, key: Uuid) -> Result<Value> {
        match db::retry(|| self.growth_start_once(user, species, key)).await {
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_run_request") => {
                self.growth_start_once(user, species, key).await
            }
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_run_open") => {
                let slot = self.db.client().await?;
                let r=one(slot.as_ref().ok_or_else(LeagueError::unavailable)?,&format!("{RUN} WHERE user_id=$1 AND status<>'closed' ORDER BY created_at DESC LIMIT 1"), &[&user]).await?;
                Err(LeagueError::new(409, "LEAGUE_RUN_EXISTS")
                    .detail(json!({"runId":r.map(|r| r["id"].clone())})))
            }
            result => result,
        }
    }
    async fn growth_start_once(&self, user: Uuid, species: i16, key: Uuid) -> Result<Value> {
        if super::profile::get(self, user).await?["nickname"].is_null() {
            return Err(LeagueError::new(409, "LEAGUE_NICKNAME_REQUIRED"));
        }
        let (s, now) = {
            let slot = self.db.client().await?;
            let c = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
            if let Some(r) = one(
                c,
                &format!("{RUN} WHERE user_id=$1 AND request_key=$2"),
                &[&user, &key],
            )
            .await?
            {
                return run_started(c, &r).await;
            }
            let s = one(
                c,
                &format!("{SEASON} WHERE settled_at IS NULL ORDER BY id DESC LIMIT 1"),
                &[],
            )
            .await?
            .ok_or_else(|| LeagueError::new(409, "LEAGUE_SEASON_NOT_OPEN"))?;
            open(&s)?;
            let now = s["now_ms"].clone();
            (s, now)
        };
        if !views::array(&s["starter_species_ids"])?.contains(&json!(species)) {
            return Err(LeagueError::new(422, "LEAGUE_STARTER_INVALID"));
        }
        let checkpoint = json!({"version":1,"growth":{"rulesVersion":1,"expMultiplierPermille":self.config.exp_multiplier_permille},"mons":{}});
        let r = json!({"created_ms":now,"now_ms":now,"checkpoint":checkpoint});
        let mut mon = self
            .mint_values(
                "starter",
                species,
                views::integer(&s["starter_level"])? as i16,
                &r,
                &s,
            )
            .await?;
        mon["monId"] = json!(Uuid::new_v4());
        let id = Uuid::new_v4();
        let season_id = views::integer(&s["id"])? as i32;
        let mut slot = self.db.client().await?;
        let tx = slot
            .as_mut()
            .ok_or_else(LeagueError::unavailable)?
            .transaction()
            .await?;
        open(&season(&tx, season_id, "FOR SHARE").await?)?;
        tx.execute("INSERT INTO poke_lounge_league_run (id,season_id,user_id,status,starter_species_id,request_key,checkpoint) VALUES ($1,$2,$3,'active',$4,$5,$6)", &[&id,&season_id,&user,&species,&key,&checkpoint]).await?;
        insert_mon(&tx, id, key, "starter", &mon).await?;
        let r = run(&tx, id, user, "").await?;
        let result = json!({"run":views::run(&r),"starter":mon,"growth":growth(&r)});
        tx.commit().await?;
        tracing::info!(event="league.run_started",run=%id,starter=species);
        Ok(result)
    }
    pub async fn growth_save_get(&self, user: Uuid, id: Uuid) -> Result<Value> {
        let slot = self.db.client().await?;
        let c = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let r = run(c, id, user, "").await?;
        if r["status"] == "closed" {
            return Err(LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"));
        }
        let save=one(c,"SELECT jsonb_build_object('rev',rev,'savedAtMs',(extract(epoch from saved_at)*1000)::bigint,'data',data) AS value FROM poke_lounge_league_run_save WHERE run_id=$1", &[&id]).await?;
        let starter = mons(c, id)
            .await?
            .into_iter()
            .find(|m| m["origin"] == "starter")
            .map(|m| public_mon(&m));
        Ok(json!({"run":views::run(&r),"growth":growth(&r),"starter":starter,"save":save}))
    }
    pub async fn growth_save_put(
        &self,
        user: Uuid,
        id: Uuid,
        base: i32,
        data: &Value,
    ) -> Result<Value> {
        let size = serde_json::to_vec(data)
            .map_err(|_| LeagueError::corrupt())?
            .len();
        if base < 0
            || !(2..=98304).contains(&size)
            || data["version"] != 1
            || data["runId"] != id.to_string()
        {
            return Err(LeagueError::new(422, "LEAGUE_SAVE_INVALID"));
        }
        let mut slot = self.db.client().await?;
        let tx = slot
            .as_mut()
            .ok_or_else(LeagueError::unavailable)?
            .transaction()
            .await?;
        let r = run(&tx, id, user, "FOR SHARE").await?;
        if r["status"] == "closed" {
            return Err(LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"));
        }
        let existing=one(&tx,"SELECT jsonb_build_object('rev',rev,'savedAtMs',(extract(epoch from saved_at)*1000)::bigint) AS value FROM poke_lounge_league_run_save WHERE run_id=$1 FOR UPDATE", &[&id]).await?;
        if existing
            .as_ref()
            .map_or(0, |v| v["rev"].as_i64().unwrap_or(-1))
            != i64::from(base)
        {
            return Err(LeagueError::new(409, "LEAGUE_SAVE_CONFLICT")
                .detail(existing.unwrap_or_else(|| json!({"rev":0,"savedAtMs":null}))));
        }
        let result=tx.query_opt("INSERT INTO poke_lounge_league_run_save (run_id,rev,data,size_bytes) VALUES ($1,1,$3,$4) ON CONFLICT (run_id) DO UPDATE SET rev=poke_lounge_league_run_save.rev+1,data=$3,size_bytes=$4,saved_at=now() WHERE poke_lounge_league_run_save.rev=$2 RETURNING rev,(extract(epoch from saved_at)*1000)::bigint AS saved", &[&id,&base,&data,&(size as i32)]).await?;
        let row = result.ok_or_else(|| LeagueError::new(409, "LEAGUE_SAVE_CONFLICT"))?;
        let rev: i32 = row.try_get("rev")?;
        let saved: i64 = row.try_get("saved")?;
        tx.commit().await?;
        tracing::info!(event="league.save",run=%id,rev,size);
        Ok(json!({"rev":rev,"savedAtMs":saved}))
    }
    pub async fn growth_mint(
        &self,
        user: Uuid,
        id: Uuid,
        species: i16,
        level: i16,
        key: Uuid,
    ) -> Result<Value> {
        let (r, s) = {
            let slot = self.db.client().await?;
            let c = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
            let r = run(c, id, user, "").await?;
            if let Some(mon) = mint_by_key(c, id, key).await? {
                return Ok(mon);
            }
            active(&r)?;
            let s = season(c, views::integer(&r["season_id"])? as i32, "").await?;
            open(&s)?;
            if views::integer(&r["mint_count"])? >= 400 {
                return Err(LeagueError::new(409, "LEAGUE_MINT_LIMIT"));
            }
            (r, s)
        };
        for retries in 0..=3 {
            let mut mon = self.mint_values("capture", species, level, &r, &s).await?;
            mon["monId"] = json!(Uuid::new_v4());
            match db::retry(|| self.growth_mint_insert(user, id, key, &r, &mon)).await {
                Ok(Some(result)) => {
                    tracing::info!(event="league.mint",run=%id,origin="capture",species,level,retries);
                    return Ok(result);
                }
                Ok(None) => continue,
                Err(e) => return Err(e),
            }
        }
        Err(LeagueError::new(503, "LEAGUE_JUDGE_UNAVAILABLE"))
    }
    async fn growth_mint_insert(
        &self,
        user: Uuid,
        id: Uuid,
        key: Uuid,
        original: &Value,
        mon: &Value,
    ) -> Result<Option<Value>> {
        let mut slot = self.db.client().await?;
        let tx = slot
            .as_mut()
            .ok_or_else(LeagueError::unavailable)?
            .transaction()
            .await?;
        open(
            &season(
                &tx,
                views::integer(&original["season_id"])? as i32,
                "FOR SHARE",
            )
            .await?,
        )?;
        let r = run(&tx, id, user, "FOR UPDATE").await?;
        if let Some(mon) = mint_by_key(&tx, id, key).await? {
            return Ok(Some(mon));
        }
        active(&r)?;
        if views::integer(&r["mint_count"])? >= 400 {
            return Err(LeagueError::new(409, "LEAGUE_MINT_LIMIT"));
        }
        if r["checkpoint"] != original["checkpoint"] {
            return Err(retry_conflict());
        }
        let duplicate=tx.query_one("SELECT EXISTS (SELECT 1 FROM poke_lounge_league_mon WHERE run_id=$1 AND individual_values=$2)", &[&id,&mon["individualValues"]]).await?.try_get::<_,bool>(0)?;
        if duplicate {
            return Ok(None);
        }
        insert_mon(&tx, id, key, "capture", mon).await?;
        tx.execute("UPDATE poke_lounge_league_run SET mint_count=mint_count+1,updated_at=now() WHERE id=$1", &[&id]).await?;
        tx.commit().await?;
        Ok(Some(mon.clone()))
    }
}
async fn mint_by_key<C: GenericClient + Sync>(c: &C, id: Uuid, key: Uuid) -> Result<Option<Value>> {
    let rows = c
        .query(
            "SELECT id FROM poke_lounge_league_mon WHERE run_id=$1 AND request_key=$2",
            &[&id, &key],
        )
        .await?;
    let Some(row) = rows.first() else {
        return Ok(None);
    };
    let mon_id: Uuid = row.try_get(0)?;
    Ok(mons(c, id)
        .await?
        .iter()
        .find(|m| m["monId"] == mon_id.to_string())
        .map(public_mon))
}
