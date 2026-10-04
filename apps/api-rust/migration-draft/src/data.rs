use std::sync::Arc;
use serde_json::{Value,json};
use tokio::sync::Mutex;
use tokio_postgres::{Client,NoTls};
use uuid::Uuid;
use crate::{config::IO_TIMEOUT,error::{AppError,AppResult},repository::hash_bytes};
const ROM_SHA1:&str="5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
const KEYS:[&str;4]=["pokemon-data","item-data","level-up-move-table","growth-table"];
#[derive(Clone)]
pub struct Data {config:Arc<tokio_postgres::Config>,client:Arc<Mutex<Option<Arc<Client>>>>,rom:Arc<Value>}
impl Data {
    pub async fn connect(config:tokio_postgres::Config)->AppResult<Self>{
        let mut data=Self{config:Arc::new(config),client:Arc::new(Mutex::new(None)),rom:Arc::new(Value::Null)};
        let rows=data.client().await?.query("SELECT document_key,schema_version,rom_sha1,content_sha256,payload FROM poke_lounge_rom_document ORDER BY document_key",&[]).await?;
        let mut documents=std::collections::BTreeMap::new();
        for row in rows {
            let key:String=row.try_get("document_key")?;let version:i32=row.try_get("schema_version")?;let rom:String=row.try_get("rom_sha1")?;let hash:String=row.try_get("content_sha256")?;let payload:Value=row.try_get("payload")?;
            if !KEYS.contains(&key.as_str())||version!=1||rom!=ROM_SHA1||payload["version"]!=1||payload["source"]["romSha1"]!=ROM_SHA1||hash_bytes(serde_json::to_string(&payload)?.as_bytes())!=hash{return Err(AppError::Configuration("ROM document integrity check failed"));}
            if documents.insert(key.clone(),json!({"documentKey":key,"schemaVersion":version,"romSha1":rom,"contentSha256":hash,"payload":payload})).is_some(){return Err(AppError::Configuration("Duplicate ROM document"));}
        }
        if KEYS.iter().any(|key|!documents.contains_key(*key)){return Err(AppError::Configuration("Required ROM document missing"));}
        data.rom=Arc::new(json!({"documents":KEYS.iter().map(|key|documents[*key].clone()).collect::<Vec<_>>()}));Ok(data)
    }
    async fn client(&self)->AppResult<Arc<Client>> {
        let mut guard=self.client.lock().await;
        if let Some(client)=guard.as_ref().filter(|c|!c.is_closed()){return Ok(client.clone());}
        let (client,connection)=tokio::time::timeout(IO_TIMEOUT,self.config.connect(NoTls)).await.map_err(|_|AppError::Unavailable)??;
        tokio::spawn(async move{if connection.await.is_err(){tracing::warn!(event="database.connection_closed");}});
        let client=Arc::new(client);*guard=Some(client.clone());Ok(client)
    }
    pub async fn ready(&self)->AppResult<()> {self.client().await?.simple_query("SELECT 1").await?;Ok(())}
    pub fn rom(&self)->Value{(*self.rom).clone()}
    pub async fn ranking(&self,game_type:&str)->AppResult<Value>{
        if game_type=="POKE_LOUNGE"{return Ok(json!([]));}
        if game_type!="SKY_DROP"{return Err(AppError::Invalid("Invalid game type"));}
        let rows=self.client().await?.query(r#"
WITH best AS (
 SELECT DISTINCT ON (h."userId") h.id,h.score,h."createdAt",h."userId"
 FROM game_history h
 WHERE h."gameType"='SKY_DROP' AND h.score BETWEEN 1 AND 100000
 AND (h."playTime" IS NULL OR (h."playTime" BETWEEN 1 AND 86400 AND h.score <= h."playTime"*2000))
 ORDER BY h."userId",h.score DESC,h."createdAt" ASC,h.id ASC
)
SELECT jsonb_build_object('score',b.score,'rank',row_number() OVER (ORDER BY b.score DESC,b."createdAt" ASC,b.id ASC),
 'createdAt',to_char(b."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'user',jsonb_build_object('displayName',concat(u."firstName",' ',u."lastName"))) AS value
FROM best b JOIN "user" u ON u.id=b."userId" ORDER BY b.score DESC,b."createdAt" ASC,b.id ASC LIMIT 10
"#,&[]).await?;
        let values=rows.iter().map(|r|r.try_get::<_,Value>("value")).collect::<Result<Vec<_>,_>>()?;Ok(json!(values))
    }
    pub async fn result(&self,id:Uuid)->AppResult<Value>{
        let row=self.client().await?.query_opt(r#"SELECT jsonb_build_object('id',h.id,'score',h.score,'gameType',h."gameType",'createdAt',to_char(h."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'user',jsonb_build_object('displayName',concat(u."firstName",' ',u."lastName"))) AS value FROM game_history h JOIN "user" u ON u.id=h."userId" WHERE h.id=$1"#,&[&id]).await?.ok_or(AppError::NotFound)?;
        Ok(row.try_get("value")?)
    }
}
