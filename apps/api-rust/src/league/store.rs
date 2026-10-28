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
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        match one(
            client,
            &format!("{ATTEMPT} WHERE user_id=$1 AND entry_key=$2"),
            &[&user, &key],
        )
        .await?
        {
            Some(a) => Ok(Some(attempt_view(client, &a).await?)),
            None => Ok(None),
        }
    }
    pub async fn current_attempt(&self, user: Uuid) -> Result<Option<Value>> {
        let slot = self.db.client().await?;
        let client = slot.as_ref().ok_or_else(LeagueError::unavailable)?;
        match one(
            client,
            &format!(
                "{ATTEMPT} WHERE user_id=$1 AND status='active' ORDER BY entered_at DESC LIMIT 1"
            ),
            &[&user],
        )
        .await?
        {
            Some(a) => Ok(Some(attempt_view(client, &a).await?)),
            None => Ok(None),
        }
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
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_attempt_entry") => {
                self.entry_by_key(user, key)
                    .await?
                    .ok_or_else(LeagueError::unavailable)
            }
            Err(e) if e.constraint.as_deref() == Some("UQ_poke_lounge_league_attempt_active") => {
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
        let prepared = self
            .judge
            .call(
                views::text(&s["engine_version"])?,
                json!({"kind":"prepare-entry","claim":claim,"mons":mons,"opponents":opponents}),
            )
            .await?;
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
        let engine = views::text(&s["engine_version"])?;
        let roster = views::text(&s["roster_version"])?;
        let carry_hash = views::text(&prepared["carryHash"])?;
        tx.execute("INSERT INTO poke_lounge_league_attempt (id,season_id,run_id,user_id,entry_key,status,rules_version,engine_version,roster_version,standings_rev,composition,challenger_party,opponents,match_seeds,carry_party,carry_hash) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11,$12,$13,$11,$14)", &[&id,&season_id,&run_id,&user,&key,&rules,&engine,&roster,&rev,&prepared["composition"],&prepared["challengerParty"],&prepared["opponents"],&seeds,&carry_hash]).await?;
        tx.execute("UPDATE poke_lounge_league_run SET status='challenging',badges=0,updated_at=now() WHERE id=$1", &[&run_id]).await?;
        let view = attempt_view(&tx, &attempt(&tx, id, user, "").await?).await?;
        tx.commit().await?;
        tracing::info!(event="league.attempt_entered",attempt=%id);
        Ok(view)
    }
}

async fn lock_run<C: GenericClient + Sync>(client: &C, a: &Value) -> Result<()> {
    let run = views::uuid(&a["run_id"])?;
    client
        .query_one(
            "SELECT id FROM poke_lounge_league_run WHERE id=$1 FOR UPDATE",
            &[&run],
        )
        .await?;
    Ok(())
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
    hash: &str,
) -> Result<Value> {
    let row = client.query_opt("SELECT inputs_hash,measure FROM poke_lounge_league_match WHERE attempt_id=$1 AND match_index=$2", &[&id,&index]).await?.ok_or_else(|| LeagueError::new(409,"LEAGUE_ATTEMPT_NOT_ACTIVE"))?;
    let previous: String = row.try_get("inputs_hash")?;
    let measure: Value = row.try_get("measure")?;
    let response = &measure["_response"];
    if !response.is_object() {
        return Err(LeagueError::corrupt());
    }
    if previous != hash {
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
    async fn reject_submission(&self, a: &Value, index: i16) -> Result<()> {
        let mut slot = self.db.client().await?;
        let client = slot.as_mut().ok_or_else(LeagueError::unavailable)?;
        let tx = client.transaction().await?;
        lock_run(&tx, a).await?;
        let id = views::uuid(&a["id"])?;
        let user = views::uuid(&a["user_id"])?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] != "active" || a["current_match"] != index {
            return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_NOT_ACTIVE"));
        }
        tx.execute("UPDATE poke_lounge_league_attempt SET rejected_submissions=rejected_submissions+1,updated_at=now() WHERE id=$1", &[&id]).await?;
        if views::integer(&a["rejected_submissions"])? >= 4 {
            fail(&tx, &a, "rejected_limit").await?;
        }
        tx.commit().await?;
        tracing::warn!(event="league.input_rejected",attempt=%id,index);
        Ok(())
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
        let a = self.read_attempt(id, user).await?;
        if let Err(e) = views::validate_submission(submission) {
            self.reject_submission(&a, index).await?;
            return Err(e);
        }
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
                return Err(LeagueError::corrupt());
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
            Err(e) if e.code == "LEAGUE_INPUT_REJECTED" => { self.reject_submission(&a,index).await?; return Err(e); }, result => result?,
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
        let result = self
            .apply_match(&a, index, submission, &inputs_hash, &judged, name)
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
        lock_run(&tx, original).await?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] != "active" || a["current_match"] != index {
            return stored_match(&tx, id, index, inputs_hash).await;
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
        lock_run(&tx, &original).await?;
        let a = attempt(&tx, id, user, "FOR UPDATE").await?;
        if a["status"] == "active" {
            fail(&tx, &a, "forfeit").await?;
        } else if a["fail_reason"] != "forfeit" {
            return Err(LeagueError::new(409, "LEAGUE_ATTEMPT_NOT_ACTIVE"));
        }
        let a = attempt(&tx, id, user, "").await?;
        tx.commit().await?;
        Ok(json!({"attempt":views::summary(&a)}))
    }
}
