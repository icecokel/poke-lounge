use super::{
    League,
    error::{LeagueError, Result},
    standings, views,
};
use serde_json::{Value, json};
use tokio_postgres::{GenericClient, IsolationLevel, types::ToSql};
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
    pub(super) async fn bootstrap(&self) -> Result<()> {
        let (Some(starts), Some(starters)) = (&self.config.starts_at, &self.config.starters) else {
            return Ok(());
        };
        {
            let slot = self.db.client().await?;
            let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
            let aligned: bool = client.query_one("SELECT extract(isodow FROM ($1::text::timestamptz AT TIME ZONE 'Asia/Seoul')) = 1 AND ($1::text::timestamptz AT TIME ZONE 'Asia/Seoul')::time = time '00:00'", &[starts]).await?.try_get(0)?;
            if !aligned {
                tracing::warn!(event = "league.season1_misaligned");
                return Ok(());
            }
        }
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
        client.execute("INSERT INTO poke_lounge_league_season (id,starts_at,closes_at,settle_deadline,starter_species_ids,starter_level,rules_version,engine_version,roster_version,npc_seeds,badge_npcs) SELECT 1,$1::text::timestamptz,$1::text::timestamptz+interval '27 days 18 hours',$1::text::timestamptz+interval '27 days 18 hours'+make_interval(hours=>$2),$3,$4,$5,$6,$7,$8,$9 WHERE NOT EXISTS (SELECT 1 FROM poke_lounge_league_season) ON CONFLICT DO NOTHING", &[starts,&self.config.grace_hours,starters,&self.config.starter_level,&self.config.rules_version,&health.engine,&health.roster,&roster["npcSeeds"],&roster["badgeNpcs"]]).await?;
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
        let engine = self.judge.health().await.ok().map(|h| h.engine);
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        let season = season(client).await?;
        let engine = engine.or_else(|| {
            season
                .as_ref()?
                .get("engine_version")?
                .as_str()
                .map(str::to_owned)
        });
        Ok(
            json!({"enabled":true,"contractVersion":1,"engineVersion":engine,"rulesVersion":self.config.rules_version,"nowMs":now(client).await?,"season":season.as_ref().map(views::season).transpose()?}),
        )
    }
    pub async fn standings(&self) -> Result<Value> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .read_only(true)
            .start()
            .await?;
        let Some(s) = one(
            &tx,
            &format!("{SEASON} ORDER BY (settled_at IS NULL) DESC,id DESC LIMIT 1"),
            &[],
        )
        .await?
        else {
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
        self.refresh_current(user).await?;
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .read_only(true)
            .start()
            .await?;
        let Some(s) = one(
            &tx,
            &format!("{SEASON} ORDER BY (settled_at IS NULL) DESC,id DESC LIMIT 1"),
            &[],
        )
        .await?
        else {
            return Ok(json!({"user":{"displayName":name},"run":null,"attempt":null,"best":null}));
        };
        let id = views::integer(&s["id"])? as i32;
        let run = one(
            &tx,
            &format!("{RUN} WHERE season_id=$1 AND user_id=$2 AND status<>'closed'"),
            &[&id, &user],
        )
        .await?;
        let attempt = one(
            &tx,
            &format!("{ATTEMPT} WHERE season_id=$1 AND user_id=$2 ORDER BY entered_at DESC,id DESC LIMIT 1"),
            &[&id, &user],
        )
        .await?;
        let attempt =
            attempt.filter(|a| matches!(a["status"].as_str(), Some("active" | "expired" | "void")));
        let best = one(&tx, "SELECT jsonb_build_object('score',score,'bestRank',best_rank,'recordedAtMs',(extract(epoch from recorded_at)*1000)::bigint) AS value FROM poke_lounge_league_record WHERE season_id=$1 AND user_id=$2", &[&id,&user]).await?;
        tx.commit().await?;
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

async fn attempt<C: GenericClient + Sync>(
    client: &C,
    id: Uuid,
    user: Uuid,
    lock: &str,
) -> Result<Value> {
    one(
        client,
        &format!("{ATTEMPT} WHERE id=$1 AND user_id=$2 {lock}"),
        &[&id, &user],
    )
    .await?
    .ok_or_else(|| LeagueError::new(404, "LEAGUE_NOT_FOUND"))
}
async fn attempt_view<C: GenericClient + Sync>(client: &C, a: &Value) -> Result<Value> {
    let id = views::uuid(&a["id"])?;
    if !a["challenger_party"].is_object() || views::array(&a["opponents"])?.len() != 5 {
        return Err(LeagueError::corrupt());
    }
    let rows = client.query("SELECT match_index,measure - '_response' AS measure FROM poke_lounge_league_match WHERE attempt_id=$1 ORDER BY match_index", &[&id]).await?;
    let matches = rows.iter().map(|r| -> Result<Value> { Ok(json!({"index":r.try_get::<_,i16>("match_index")?,"measure":r.try_get::<_,Value>("measure")?})) }).collect::<Result<Vec<_>>>()?;
    let mut view = views::summary(a);
    view["engineVersion"] = a["engine_version"].clone();
    view["rulesVersion"] = a["rules_version"].clone();
    view["challengerParty"] = a["challenger_party"].clone();
    view["opponents"] = a["opponents"].clone();
    view["matches"] = json!(matches);
    if a["status"] == "active" {
        view["current"] = views::current(a)?;
    }
    Ok(view)
}
fn check_run(run: &Value, user: Uuid, season: i32) -> Result<()> {
    if views::uuid(&run["user_id"])? != user
        || views::integer(&run["season_id"])? != i64::from(season)
        || run["status"] != "active"
    {
        return Err(LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"));
    }
    if run["badges"] != 8 {
        return Err(LeagueError::new(409, "LEAGUE_BADGES_REQUIRED"));
    }
    Ok(())
}
impl League {
    async fn entry_by_key(&self, user: Uuid, key: Uuid) -> Result<Option<Value>> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .read_only(true)
            .start()
            .await?;
        let a = one(
            &tx,
            &format!("{ATTEMPT} WHERE user_id=$1 AND entry_key=$2"),
            &[&user, &key],
        )
        .await?;
        let view = match a {
            Some(a) => Some(attempt_view(&tx, &a).await?),
            None => None,
        };
        tx.commit().await?;
        Ok(view)
    }
    pub async fn current_attempt(&self, user: Uuid) -> Result<Option<Value>> {
        self.refresh_current(user).await?;
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .read_only(true)
            .start()
            .await?;
        let a = one(
            &tx,
            &format!("{ATTEMPT} WHERE user_id=$1 ORDER BY entered_at DESC,id DESC LIMIT 1"),
            &[&user],
        )
        .await?;
        let a = a.filter(|a| matches!(a["status"].as_str(), Some("active" | "expired" | "void")));
        let view = match a {
            Some(a) => Some(attempt_view(&tx, &a).await?),
            None => None,
        };
        tx.commit().await?;
        Ok(view)
    }
    pub async fn enter_attempt(
        &self,
        user: Uuid,
        run: Uuid,
        key: Uuid,
        claim: &Value,
    ) -> Result<Value> {
        let result = super::db::retry(|| self.enter_once(user, run, key, claim)).await;
        match result {
            Err(e)
                if matches!(
                    e.code,
                    "LEAGUE_RUN_NOT_ACTIVE" | "LEAGUE_BADGES_REQUIRED" | "LEAGUE_ATTEMPT_ACTIVE"
                ) =>
            {
                if let Some(existing) = self.entry_by_key(user, key).await? {
                    return Ok(existing);
                }
                if let Some(a) = self
                    .current_attempt(user)
                    .await?
                    .filter(|a| a["status"] == "active")
                {
                    return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_ACTIVE")
                        .detail(json!({"attemptId":a["id"]})));
                }
                Err(e)
            }
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_attempt_entry") => {
                self.entry_by_key(user, key)
                    .await?
                    .ok_or_else(LeagueError::unavailable)
            }
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_attempt_active") => {
                if let Some(existing) = self.entry_by_key(user, key).await? {
                    return Ok(existing);
                }
                Err(LeagueError::new(409, "LEAGUE_ATTEMPT_ACTIVE").detail(
                    json!({"attemptId":self.current_attempt(user).await?.map(|a| a["id"].clone())}),
                ))
            }
            result => result,
        }
    }
    async fn enter_once(
        &self,
        user: Uuid,
        run_id: Uuid,
        key: Uuid,
        claim: &Value,
    ) -> Result<Value> {
        if let Some(existing) = self.entry_by_key(user, key).await? {
            return Ok(existing);
        }
        views::validate_claim(claim)?;
        let (s, opponents, mons) = {
            let slot = self.db.client().await?;
            let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
            let s = season(client)
                .await?
                .ok_or_else(|| LeagueError::new(409, "LEAGUE_SEASON_NOT_OPEN"))?;
            if views::season(&s)?["phase"] != "open" {
                return Err(LeagueError::new(409, "LEAGUE_SEASON_NOT_OPEN"));
            }
            let season_id = views::integer(&s["id"])? as i32;
            let run = one(
                client,
                &format!("{RUN} WHERE id=$1 AND user_id=$2"),
                &[&run_id, &user],
            )
            .await?
            .ok_or_else(|| LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"))?;
            check_run(&run, user, season_id)?;
            if let Some(a) = one(
                client,
                &format!("{ATTEMPT} WHERE season_id=$1 AND user_id=$2 AND status='active'"),
                &[&season_id, &user],
            )
            .await?
            {
                return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_ACTIVE")
                    .detail(json!({"attemptId":a["id"]})));
            }
            let opponents = standings::top(client, &s)
                .await?
                .into_iter()
                .rev()
                .map(|s| json!({"meta":s.meta,"composition":s.composition}))
                .collect::<Vec<_>>();
            let ids = views::array(&claim["members"])?
                .iter()
                .map(|m| views::uuid(&m["monId"]))
                .collect::<Result<Vec<_>>>()?;
            let rows = client.query("SELECT jsonb_build_object('monId',id,'speciesId',species_id,'level',level,'individualValues',individual_values,'natureId',nature_id,'abilityId',ability_id,'gender',gender) AS value FROM poke_lounge_league_mon WHERE run_id=$1 AND id=ANY($2)", &[&run_id,&ids]).await?;
            if rows.len() != 6 {
                return Err(LeagueError::new(422, "LEAGUE_PARTY_INVALID")
                    .detail(json!({"reasons":["Party contains an unissued mon"]})));
            }
            let mons = rows
                .iter()
                .map(|r| r.try_get::<_, Value>("value"))
                .collect::<std::result::Result<Vec<_>, _>>()?;
            (s, opponents, mons)
        };
        let health = self.judge.health().await?;
        let prepared = self
            .judge
            .call(
                &health.engine,
                json!({"kind":"prepare-entry","claim":claim,"mons":mons,"opponents":opponents}),
            )
            .await
            .map_err(|e| {
                if e.code == "LEAGUE_ENGINE_RETIRED" {
                    LeagueError::new(503, "LEAGUE_JUDGE_UNAVAILABLE")
                } else {
                    e
                }
            })?;
        if !views::hash(&prepared["carryHash"], 16)
            || !prepared["composition"].is_object()
            || !prepared["challengerParty"].is_object()
            || views::array(&prepared["opponents"])?.len() != 5
        {
            return Err(LeagueError::corrupt());
        }
        let seeds: Vec<[u16; 4]> = (0..5).map(|_| rand::random()).collect();
        let seeds = json!(seeds);
        let id = Uuid::new_v4();
        let season_id = views::integer(&s["id"])? as i32;
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        let locked = self::season_id(&tx, season_id, "FOR SHARE").await?;
        if views::season(&locked)?["phase"] != "open" {
            return Err(LeagueError::new(409, "LEAGUE_SEASON_NOT_OPEN"));
        }
        if locked["standings_rev"] != s["standings_rev"] {
            let mut e = LeagueError::unavailable();
            e.retry = true;
            return Err(e);
        }
        let run = one(&tx, &format!("{RUN} WHERE id=$1 FOR UPDATE"), &[&run_id])
            .await?
            .ok_or_else(|| LeagueError::new(409, "LEAGUE_RUN_NOT_ACTIVE"))?;
        // A concurrent retry may have consumed the badges while preparing this request.
        if let Some(a) = one(
            &tx,
            &format!("{ATTEMPT} WHERE user_id=$1 AND entry_key=$2"),
            &[&user, &key],
        )
        .await?
        {
            return attempt_view(&tx, &a).await;
        }
        if let Some(a) = one(
            &tx,
            &format!("{ATTEMPT} WHERE season_id=$1 AND user_id=$2 AND status='active'"),
            &[&season_id, &user],
        )
        .await?
        {
            return Err(
                LeagueError::new(409, "LEAGUE_ATTEMPT_ACTIVE").detail(json!({"attemptId":a["id"]}))
            );
        }
        check_run(&run, user, season_id)?;
        let rules = views::integer(&s["rules_version"])? as i16;
        let rev = views::integer(&s["standings_rev"])?;
        let engine = &health.engine;
        let roster = &health.roster;
        let carry_hash = views::text(&prepared["carryHash"])?;
        tx.execute("INSERT INTO poke_lounge_league_attempt (id,season_id,run_id,user_id,entry_key,status,rules_version,engine_version,roster_version,standings_rev,composition,challenger_party,opponents,match_seeds,carry_party,carry_hash) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$13,$11,$14)", &[&id,&season_id,&run_id,&user,&key,&rules,&engine,&roster,&rev,&prepared["composition"],&prepared["challengerParty"],&prepared["opponents"],&seeds,&carry_hash]).await?;
        tx.execute("UPDATE poke_lounge_league_run SET status='challenging',badges=0,updated_at=now() WHERE id=$1", &[&run_id]).await?;
        let view = attempt_view(&tx, &attempt(&tx, id, user, "").await?).await?;
        tx.commit().await?;
        tracing::info!(event="league.attempt_entered",attempt=%id);
        Ok(view)
    }
}

/// T6 entry point: F2 can validate and update badges while retaining this transaction's run lock.
pub async fn lock_run(client: &tokio_postgres::Transaction<'_>, run: Uuid) -> Result<Value> {
    one(client, &format!("{RUN} WHERE id=$1 FOR UPDATE"), &[&run])
        .await?
        .ok_or_else(|| LeagueError::new(404, "LEAGUE_NOT_FOUND"))
}
async fn fail<C: GenericClient + Sync>(client: &C, a: &Value, reason: &str) -> Result<()> {
    let id = views::uuid(&a["id"])?;
    let run = views::uuid(&a["run_id"])?;
    client.execute("UPDATE poke_lounge_league_attempt SET status='failed',fail_reason=$2,finished_at=now(),updated_at=now() WHERE id=$1", &[&id,&reason]).await?;
    client.execute("UPDATE poke_lounge_league_run SET status='active',updated_at=now() WHERE id=$1 AND status='challenging'", &[&run]).await?;
    Ok(())
}
async fn stored_match<C: GenericClient + Sync>(
    client: &C,
    id: Uuid,
    index: i16,
    lead: i16,
    hash: &str,
) -> Result<Value> {
    let row = client.query_opt("SELECT inputs_hash,lead_slot,measure FROM poke_lounge_league_match WHERE attempt_id=$1 AND match_index=$2", &[&id,&index]).await?.ok_or_else(|| LeagueError::new(409,"LEAGUE_ATTEMPT_NOT_ACTIVE"))?;
    let previous: String = row.try_get("inputs_hash")?;
    let measure: Value = row.try_get("measure")?;
    let response = &measure["_response"];
    if !response.is_object() {
        return Err(LeagueError::corrupt());
    }
    if previous != hash || row.try_get::<_, i16>("lead_slot")? != lead {
        return Err(
            LeagueError::new(409, "LEAGUE_MATCH_ALREADY_JUDGED").detail(json!({"result":response}))
        );
    }
    Ok(response.clone())
}
impl League {
    async fn read_attempt(&self, id: Uuid, user: Uuid) -> Result<Value> {
        let slot = self.db.client().await?;
        attempt(
            slot.as_ref().ok_or_else(LeagueError::unavailable)?,
            id,
            user,
            "",
        )
        .await
    }
    async fn reject_submission(
        &self,
        a: &Value,
        index: i16,
        lead: i16,
        inputs_hash: &str,
    ) -> Result<Option<Value>> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        let season_id = views::integer(&a["season_id"])? as i32;
        let season = self::season_id(&tx, season_id, "FOR SHARE").await?;
        lock_run(&tx, views::uuid(&a["run_id"])?).await?;
        let id = views::uuid(&a["id"])?;
        let user = views::uuid(&a["user_id"])?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] != "active" || a["current_match"] != index {
            return Ok(Some(stored_match(&tx, id, index, lead, inputs_hash).await?));
        }
        if views::integer(&season["now_ms"])? > views::integer(&season["deadline_ms"])? {
            tx.rollback().await?;
            drop(slot);
            self.expire_attempt(id).await?;
            return Err(LeagueError::new(410, "LEAGUE_ATTEMPT_EXPIRED"));
        }
        tx.execute("UPDATE poke_lounge_league_attempt SET rejected_submissions=rejected_submissions+1,updated_at=now() WHERE id=$1", &[&id]).await?;
        if views::integer(&a["rejected_submissions"])? >= 4 {
            fail(&tx, &a, "rejected_limit").await?;
        }
        tx.commit().await?;
        tracing::warn!(event="league.input_rejected",attempt=%id,index);
        Ok(None)
    }
    pub async fn submit_match(
        &self,
        user: Uuid,
        name: &str,
        id: Uuid,
        index: i16,
        submission: &Value,
    ) -> Result<Value> {
        if !(0..5).contains(&index) {
            return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
        }
        let original = self.read_attempt(id, user).await?;
        let was_active = original["status"] == "active";
        let a = self.refresh_attempt(original).await?;
        if was_active && a["status"] == "expired" {
            return Err(LeagueError::new(410, "LEAGUE_ATTEMPT_EXPIRED"));
        }
        if was_active && a["status"] == "void" {
            return Err(LeagueError::new(409, "LEAGUE_ENGINE_RETIRED"));
        }
        views::validate_submission(submission)?;
        let lead = views::integer(&submission["leadSlot"])? as i16;
        let inputs_hash = crate::repository::hash_bytes(
            serde_json::to_string(&submission["inputs"])
                .map_err(|_| LeagueError::corrupt())?
                .as_bytes(),
        );
        if a["status"] != "active" || i64::from(index) < views::integer(&a["current_match"])? {
            let slot = self.db.client().await?;
            return stored_match(
                slot.as_ref().ok_or_else(LeagueError::unavailable)?,
                id,
                index,
                lead,
                &inputs_hash,
            )
            .await;
        }
        if a["current_match"] != index {
            return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_NOT_ACTIVE"));
        }
        if submission["engineVersion"] != a["engine_version"] {
            return Err(LeagueError::new(409, "LEAGUE_ENGINE_VERSION_MISMATCH"));
        }
        if submission["startHash"] != a["carry_hash"] {
            return Err(LeagueError::new(409, "LEAGUE_STATE_MISMATCH")
                .detail(json!({"carryParty":a["carry_party"],"carryHash":a["carry_hash"]})));
        }
        let previous_q = {
            let slot = self.db.client().await?;
            let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
            let rows = client.query("SELECT measure->'q' AS q FROM poke_lounge_league_match WHERE attempt_id=$1 ORDER BY match_index", &[&id]).await?;
            let q = rows
                .iter()
                .map(|r| r.try_get::<_, Value>("q"))
                .collect::<std::result::Result<Vec<_>, _>>()?;
            if q.len() != index as usize {
                return stored_match(client, id, index, lead, &inputs_hash).await;
            }
            q
        };
        let seed = views::array(&a["match_seeds"])?
            .get(index as usize)
            .ok_or_else(LeagueError::corrupt)?;
        let opponent = &views::array(&a["opponents"])?
            .get(index as usize)
            .ok_or_else(LeagueError::corrupt)?["party"];
        let started = std::time::Instant::now();
        let judged = match self.judge.call(views::text(&a["engine_version"])?,json!({"kind":"judge-match","seed":seed,"matchIndex":index,"carryParty":a["carry_party"],"opponent":opponent,"leadSlot":submission["leadSlot"],"inputs":submission["inputs"],"previousQ":previous_q})).await {
            Err(e) if e.code == "LEAGUE_INPUT_REJECTED" => {
                if let Some(result) = super::db::retry(|| self.reject_submission(&a,index,lead,&inputs_hash)).await? { return Ok(result); }
                return Err(e);
            },
            Err(e) if e.code == "LEAGUE_ENGINE_RETIRED" => {
                let engine = views::text(&e.detail["engineVersion"])?;
                self.void_attempt(id,engine).await?;
                if self.read_attempt(id,user).await?["status"] == "expired" {
                    return Err(LeagueError::new(410,"LEAGUE_ATTEMPT_EXPIRED"));
                }
                return Err(e);
            },
            result => result?,
        };
        let status = views::text(&judged["measure"]["status"])?;
        let turns = views::integer(&judged["measure"]["turns"])?;
        if !matches!(status, "won" | "lost" | "draw")
            || turns < 0
            || !judged["measure"]["q"].is_object()
        {
            return Err(LeagueError::corrupt());
        }
        if status == "won"
            && index < 4
            && (!views::hash(&judged["carryHash"], 16) || !judged["carryParty"].is_object())
        {
            return Err(LeagueError::corrupt());
        }
        if status == "won"
            && index == 4
            && (!(0..=10000).contains(&views::integer(&judged["final"]["score"])?)
                || !judged["final"]["detail"].is_object())
        {
            return Err(LeagueError::corrupt());
        }
        let result = super::db::retry(|| {
            self.apply_match(&a, index, submission, &inputs_hash, &judged, name)
        })
        .await?;
        tracing::info!(event="league.match_judged",attempt=%id,index,status,turns,duration_ms=started.elapsed().as_millis() as u64);
        if submission["client"]["endHash"] != judged["measure"]["endHash"] {
            tracing::warn!(event="league.replay_divergence",attempt=%id,index,client_end_hash=?submission["client"]["endHash"],server_end_hash=?judged["measure"]["endHash"],engine_version=?a["engine_version"]);
        }
        Ok(result)
    }
    async fn apply_match(
        &self,
        original: &Value,
        index: i16,
        submission: &Value,
        inputs_hash: &str,
        judged: &Value,
        name: &str,
    ) -> Result<Value> {
        let id = views::uuid(&original["id"])?;
        let user = views::uuid(&original["user_id"])?;
        let run = views::uuid(&original["run_id"])?;
        let season_id = views::integer(&original["season_id"])? as i32;
        let status = views::text(&judged["measure"]["status"])?;
        let completed = status == "won" && index == 4;
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        let season = self::season_id(
            &tx,
            season_id,
            if completed { "FOR UPDATE" } else { "FOR SHARE" },
        )
        .await?;
        lock_run(&tx, views::uuid(&original["run_id"])?).await?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] != "active" || a["current_match"] != index {
            return stored_match(
                &tx,
                id,
                index,
                views::integer(&submission["leadSlot"])? as i16,
                inputs_hash,
            )
            .await;
        }
        if views::integer(&season["now_ms"])? > views::integer(&season["deadline_ms"])? {
            tx.rollback().await?;
            drop(slot);
            self.expire_attempt(id).await?;
            return Err(LeagueError::new(410, "LEAGUE_ATTEMPT_EXPIRED"));
        }
        let mut final_view = None;
        if completed {
            let score = views::integer(&judged["final"]["score"])? as i32;
            tx.execute("UPDATE poke_lounge_league_attempt SET status='completed',current_match=5,score=$2,score_detail=$3,finished_at=now(),updated_at=now() WHERE id=$1", &[&id,&score,&judged["final"]["detail"]]).await?;
            let previous = tx.query_opt("SELECT score FROM poke_lounge_league_record WHERE season_id=$1 AND user_id=$2 FOR UPDATE", &[&season_id,&user]).await?;
            let recorded = match previous {
                Some(row) => score > row.try_get::<_, i32>("score")?,
                None => true,
            };
            if recorded {
                let seq:i64 = tx.query_one("UPDATE poke_lounge_league_season SET accept_seq=accept_seq+1,standings_rev=standings_rev+1 WHERE id=$1 RETURNING accept_seq", &[&season_id]).await?.try_get(0)?;
                let party = views::public_party(&a["composition"])?;
                tx.execute("INSERT INTO poke_lounge_league_record (season_id,user_id,attempt_id,score,accept_seq,display_name,composition,public_party,recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (season_id,user_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,score=EXCLUDED.score,accept_seq=EXCLUDED.accept_seq,display_name=EXCLUDED.display_name,composition=EXCLUDED.composition,public_party=EXCLUDED.public_party,recorded_at=EXCLUDED.recorded_at", &[&season_id,&user,&id,&score,&seq,&name,&a["composition"],&party]).await?;
            }
            let top = standings::top(&tx, &season).await?;
            let mut position = None;
            for (i, entry) in top.iter().enumerate() {
                if let Some(player) = entry.user {
                    let rank = (i + 1) as i16;
                    tx.execute("UPDATE poke_lounge_league_record SET best_rank=LEAST(COALESCE(best_rank,32767::smallint),$3::smallint) WHERE season_id=$1 AND user_id=$2", &[&season_id,&player,&rank]).await?;
                    if player == user {
                        position = Some(rank);
                    }
                }
            }
            let best:Option<i16> = tx.query_one("SELECT best_rank FROM poke_lounge_league_record WHERE season_id=$1 AND user_id=$2", &[&season_id,&user]).await?.try_get(0)?;
            tx.execute("UPDATE poke_lounge_league_run SET status='closed',closed_at=now(),close_reason='completed',updated_at=now() WHERE id=$1", &[&run]).await?;
            final_view = Some(
                json!({"score":score,"recorded":recorded,"position":position,"bestRank":best,"runClosed":true}),
            );
        } else if status == "won" {
            let next = index + 1;
            let hash = views::text(&judged["carryHash"])?;
            tx.execute("UPDATE poke_lounge_league_attempt SET current_match=$2,carry_party=$3,carry_hash=$4,updated_at=now() WHERE id=$1", &[&id,&next,&judged["carryParty"],&hash]).await?;
        } else {
            let reason = if status == "draw" && views::integer(&judged["measure"]["turns"])? > 300 {
                "turn_limit"
            } else {
                status
            };
            fail(&tx, &a, reason).await?;
        }
        let updated = attempt(&tx, id, user, "").await?;
        let mut response = json!({"measure":judged["measure"],"attempt":views::summary(&updated)});
        if updated["status"] == "active" {
            response["next"] = views::current(&updated)?;
        }
        if let Some(final_view) = final_view {
            response["final"] = final_view;
        }
        let mut measure = judged["measure"].clone();
        // Persist the response snapshot so retries keep the original next state and final rank.
        measure["_response"] = response.clone();
        let lead = views::integer(&submission["leadSlot"])? as i16;
        let client_end = views::text(&submission["client"]["endHash"])?;
        tx.execute("INSERT INTO poke_lounge_league_match (attempt_id,match_index,status,lead_slot,inputs,inputs_hash,measure,client_end_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", &[&id,&index,&status,&lead,&submission["inputs"],&inputs_hash,&measure,&client_end]).await?;
        tx.commit().await?;
        if completed {
            tracing::info!(event="league.attempt_completed",attempt=%id,score=?response["final"]["score"],recorded=?response["final"]["recorded"]);
        }
        Ok(response)
    }
    pub async fn forfeit(&self, user: Uuid, id: Uuid) -> Result<Value> {
        let original = self.read_attempt(id, user).await?;
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        let season_id = views::integer(&original["season_id"])? as i32;
        let season = self::season_id(&tx, season_id, "FOR SHARE").await?;
        lock_run(&tx, views::uuid(&original["run_id"])?).await?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] == "active" {
            if views::integer(&season["now_ms"])? > views::integer(&season["deadline_ms"])? {
                tx.rollback().await?;
                drop(slot);
                self.expire_attempt(id).await?;
                return Ok(json!({"attempt":views::summary(&self.read_attempt(id, user).await?)}));
            }
            fail(&tx, &a, "forfeit").await?;
        } else if a["fail_reason"] != "forfeit" {
            return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_NOT_ACTIVE"));
        }
        let a = attempt(&tx, id, user, "").await?;
        tx.commit().await?;
        Ok(json!({"attempt":views::summary(&a)}))
    }
}

#[allow(dead_code, reason = "F6 scheduler is added in the next commit")]
pub enum StarterSource {
    Plan,
    Pool { seed: i64 },
}

/// F6 supplies the next season policy; settlement and creation share one transaction.
#[allow(
    dead_code,
    reason = "F6 adds the season scheduler in the next implementation round"
)]
pub struct NextSeason {
    pub starter_species_ids: Vec<i16>,
    pub starter_level: i16,
    pub starter_source: StarterSource,
    pub rules_version: i16,
    pub engine_version: String,
    pub roster_version: String,
    pub npc_seeds: Value,
    pub badge_npcs: Value,
}
impl League {
    pub async fn expire_attempt(&self, id: Uuid) -> Result<bool> {
        super::db::retry(|| self.end_attempt(id, None)).await
    }
    pub async fn void_attempt(&self, id: Uuid, engine: &str) -> Result<bool> {
        super::db::retry(|| self.end_attempt(id, Some(engine))).await
    }
    async fn end_attempt(&self, id: Uuid, engine: Option<&str>) -> Result<bool> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let original = one(client, &format!("{ATTEMPT} WHERE id=$1"), &[&id])
            .await?
            .ok_or_else(|| LeagueError::new(404, "LEAGUE_NOT_FOUND"))?;
        let season_id = views::integer(&original["season_id"])? as i32;
        let user = views::uuid(&original["user_id"])?;
        let tx = client.transaction().await?;
        let s = self::season_id(&tx, season_id, "FOR SHARE").await?;
        lock_run(&tx, views::uuid(&original["run_id"])?).await?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] != "active" {
            return Ok(false);
        }
        let expired = views::integer(&s["now_ms"])? > views::integer(&s["deadline_ms"])?;
        let retired = engine.is_some_and(|version| a["engine_version"] != version);
        if !expired && !retired {
            return Ok(false);
        }
        let status = if expired { "expired" } else { "void" };
        let reason = if expired {
            "season_closed"
        } else {
            "engine_retired"
        };
        tx.execute("UPDATE poke_lounge_league_attempt SET status=$2,fail_reason=$3,finished_at=now(),updated_at=now() WHERE id=$1 AND status='active'", &[&id,&status,&reason]).await?;
        let run = views::uuid(&a["run_id"])?;
        tx.execute("UPDATE poke_lounge_league_run SET status='active',badges=CASE WHEN $2 THEN badges ELSE 8 END,updated_at=now() WHERE id=$1 AND status='challenging'", &[&run,&expired]).await?;
        tx.commit().await?;
        if expired {
            tracing::info!(event="league.expired",attempt=%id);
        } else {
            tracing::info!(event="league.attempt_voided",attempt=%id,old_version=?a["engine_version"],new_version=engine);
        }
        Ok(true)
    }
    async fn refresh_attempt(&self, mut a: Value) -> Result<Value> {
        if a["status"] != "active" {
            return Ok(a);
        }
        let id = views::uuid(&a["id"])?;
        let user = views::uuid(&a["user_id"])?;
        self.expire_attempt(id).await?;
        a = self.read_attempt(id, user).await?;
        if a["status"] == "active"
            && let Ok(health) = self.judge.health().await
            && a["engine_version"] != health.engine
        {
            self.void_attempt(id, &health.engine).await?;
            a = self.read_attempt(id, user).await?;
        }
        Ok(a)
    }
    async fn refresh_current(&self, user: Uuid) -> Result<()> {
        let a = {
            let slot = self.db.client().await?;
            one(slot.as_ref().ok_or_else(LeagueError::unavailable)?,&format!("{ATTEMPT} WHERE user_id=$1 AND status='active' ORDER BY entered_at DESC LIMIT 1"), &[&user]).await?
        };
        if let Some(a) = a {
            self.refresh_attempt(a).await?;
        }
        Ok(())
    }
    #[allow(
        dead_code,
        reason = "F6 adds the season scheduler in the next implementation round"
    )]
    pub async fn settle_season(&self, id: i32, next: &NextSeason) -> Result<bool> {
        super::db::retry(|| self.settle_once(id, next)).await
    }
    #[allow(
        dead_code,
        reason = "F6 adds the season scheduler in the next implementation round"
    )]
    async fn settle_once(&self, id: i32, next: &NextSeason) -> Result<bool> {
        let next_id = id.checked_add(1).ok_or_else(LeagueError::corrupt)?;
        if !(3..=6).contains(&next.starter_species_ids.len())
            || next
                .starter_species_ids
                .iter()
                .any(|s| !(1..=493).contains(s))
            || !(1..=100).contains(&next.starter_level)
            || next.rules_version != 1
            || next.engine_version.is_empty()
            || next.engine_version.len() > 96
            || next.roster_version.is_empty()
            || next.roster_version.len() > 96
            || views::array(&next.npc_seeds)?.len() != 5
            || views::array(&next.badge_npcs)?.len() != 8
        {
            return Err(LeagueError::corrupt());
        }
        let mut starters = next.starter_species_ids.clone();
        starters.sort_unstable();
        starters.dedup();
        if starters.len() != next.starter_species_ids.len() {
            return Err(LeagueError::corrupt());
        }
        let mut orders = views::array(&next.npc_seeds)?
            .iter()
            .map(|n| views::integer(&n["order"]))
            .collect::<Result<Vec<_>>>()?;
        orders.sort_unstable();
        if orders != [1, 2, 3, 4, 5] {
            return Err(LeagueError::corrupt());
        }
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        let s = self::season_id(&tx, id, "FOR UPDATE").await?;
        if !s["settled_at"].is_null()
            || views::integer(&s["now_ms"])? < views::integer(&s["closes_ms"])?
        {
            return Ok(false);
        }
        // Serialize plan writers too: a plan committed before this lock always wins.
        tx.batch_execute("LOCK TABLE poke_lounge_league_season_plan IN SHARE MODE")
            .await?;
        let plan = tx.query_opt("SELECT starter_species_ids,starter_level FROM poke_lounge_league_season_plan WHERE season_id=$1", &[&next_id]).await?;
        let (source, seed) = match (&next.starter_source, plan) {
            (StarterSource::Plan, Some(plan)) => {
                let ids: Vec<i16> = plan.try_get(0)?;
                let level: i16 = plan.try_get(1)?;
                if ids != next.starter_species_ids || level != next.starter_level {
                    return Ok(false);
                }
                ("plan", None)
            }
            (StarterSource::Pool { seed }, None) => ("pool", Some(*seed)),
            _ => return Ok(false),
        };
        let active:i64 = tx.query_one("SELECT count(*) FROM poke_lounge_league_attempt WHERE season_id=$1 AND status='active'", &[&id]).await?.try_get(0)?;
        if active > 0 && views::integer(&s["now_ms"])? < views::integer(&s["deadline_ms"])? {
            return Ok(false);
        }
        tx.query("SELECT id FROM poke_lounge_league_run WHERE season_id=$1 AND status<>'closed' ORDER BY id FOR UPDATE", &[&id]).await?;
        tx.query("SELECT id FROM poke_lounge_league_attempt WHERE season_id=$1 AND status='active' ORDER BY id FOR UPDATE", &[&id]).await?;
        tx.execute("UPDATE poke_lounge_league_attempt SET status='expired',fail_reason='season_closed',finished_at=now(),updated_at=now() WHERE season_id=$1 AND status='active'", &[&id]).await?;
        for entry in standings::top(&tx, &s).await? {
            let position = views::integer(&entry.meta["position"])? as i16;
            let kind = views::text(&entry.meta["kind"])?;
            let name = views::text(&entry.meta["displayName"])?;
            let npc = entry.meta["npcKey"].as_str();
            tx.execute("INSERT INTO poke_lounge_league_hall_of_fame (season_id,position,kind,user_id,npc_key,display_name,score,public_party) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", &[&id,&position,&kind,&entry.user,&npc,&name,&entry.score,&entry.public_party]).await?;
        }
        tx.execute("WITH ranked AS (SELECT user_id,row_number() OVER (ORDER BY score DESC,accept_seq ASC) AS position FROM poke_lounge_league_record WHERE season_id=$1) UPDATE poke_lounge_league_record r SET final_rank=ranked.position FROM ranked WHERE r.season_id=$1 AND r.user_id=ranked.user_id", &[&id]).await?;
        tx.execute("UPDATE poke_lounge_league_run SET status='closed',close_reason='season_end',closed_at=now(),updated_at=now() WHERE season_id=$1 AND status<>'closed'", &[&id]).await?;
        tx.execute(
            "UPDATE poke_lounge_league_season SET settled_at=now() WHERE id=$1",
            &[&id],
        )
        .await?;
        let created = tx.query_one("INSERT INTO poke_lounge_league_season (id,starts_at,closes_at,settle_deadline,starter_species_ids,starter_level,rules_version,engine_version,roster_version,npc_seeds,badge_npcs,starter_source,starter_seed) SELECT $1,GREATEST(p.closes_at+interval '6 hours',now()),p.closes_at+interval '6 hours'+interval '27 days 18 hours',p.closes_at+interval '6 hours'+interval '27 days 18 hours'+make_interval(hours=>$2),$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM poke_lounge_league_season p WHERE p.id=$12 RETURNING (extract(epoch FROM starts_at)*1000)::bigint AS starts_ms,(extract(epoch FROM closes_at)*1000)::bigint AS closes_ms,starts_at>now() AS scheduled", &[&next_id,&self.config.grace_hours,&next.starter_species_ids,&next.starter_level,&next.rules_version,&next.engine_version,&next.roster_version,&next.npc_seeds,&next.badge_npcs,&source,&seed,&id]).await?;
        tx.commit().await?;
        tracing::info!(
            event = "league.season_settled",
            season = id,
            expired = active
        );
        tracing::info!(
            event = "league.season_created",
            id = next_id,
            starts_ms = created.try_get::<_, i64>("starts_ms")?,
            closes_ms = created.try_get::<_, i64>("closes_ms")?,
            phase = if created.try_get::<_, bool>("scheduled")? {
                "scheduled"
            } else {
                "open"
            },
            starter_source = source,
        );
        Ok(true)
    }
}
