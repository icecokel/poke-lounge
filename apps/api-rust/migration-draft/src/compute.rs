use std::{sync::Arc,time::Duration};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use tokio::sync::Semaphore;
use uuid::Uuid;
use crate::error::{AppError,AppResult};

pub const ENGINE_VERSION: &str = include_str!("../engine-version.txt");
#[derive(Clone)]
pub struct Compute { client:reqwest::Client, url:Arc<str>,token:Arc<str>, capacity:Arc<Semaphore> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct BattlePack { pub state:Value, pub public_state:Value, pub state_hash:String, pub required_player_ids:Vec<String> }
impl Compute {
    pub fn new(url:String,token:String)->AppResult<Self> {
        let parsed=reqwest::Url::parse(&url).map_err(|_|AppError::Configuration("Invalid worker URL"))?;
        if parsed.scheme()!="http" || parsed.host_str().is_none() || parsed.username()!="" || parsed.password().is_some() || parsed.query().is_some() { return Err(AppError::Configuration("Worker URL must be internal HTTP")); }
        let client=reqwest::Client::builder().connect_timeout(Duration::from_secs(2)).timeout(Duration::from_secs(9)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|AppError::Unavailable)?;
        Ok(Self{client,url:url.trim_end_matches('/').into(),token:token.into(),capacity:Arc::new(Semaphore::new(32))})
    }
    pub async fn ready(&self)->AppResult<()> {
        let response=self.client.get(format!("{}/health",self.url)).header("x-worker-token",self.token.as_ref()).send().await.map_err(|_|AppError::Unavailable)?;
        if !response.status().is_success() {return Err(AppError::Unavailable);}
        let body=self.read(response).await?;
        if body["engineVersion"]!=ENGINE_VERSION.trim() || body["readyWorkers"].as_u64().unwrap_or(0)==0 {return Err(AppError::Unavailable);}
        Ok(())
    }
    pub async fn run(&self,id:Uuid,revision:u64,operation:Value)->AppResult<Value> {
        let _permit=self.capacity.clone().try_acquire_owned().map_err(|_|AppError::Busy)?;
        let request_id=Uuid::new_v4();
        let response=self.client.post(format!("{}/compute",self.url)).header("x-worker-token",self.token.as_ref())
            .json(&json!({"protocolVersion":1,"requestId":request_id,"roomInstanceId":id,"stateRevision":revision,"engineVersion":ENGINE_VERSION.trim(),"operation":operation}))
            .send().await.map_err(|_|AppError::ComputeUnavailable)?;
        let status=response.status();
        let body=self.read(response).await?;
        if body["requestId"]!=request_id.to_string() || body["roomInstanceId"]!=id.to_string() || body["stateRevision"]!=revision || body["engineVersion"]!=ENGINE_VERSION.trim() || body["protocolVersion"]!=1 {return Err(AppError::ComputeUnavailable);}
        if !status.is_success() || body["ok"]!=true {
            return Err(if body["code"]=="INVALID_INPUT" {AppError::Invalid("Invalid battle or party input")} else {AppError::ComputeUnavailable});
        }
        body.get("data").cloned().ok_or(AppError::ComputeUnavailable)
    }
    pub async fn battle(&self,id:Uuid,revision:u64,operation:Value,players:&[String;2])->AppResult<BattlePack> {
        let result:BattlePack=serde_json::from_value(self.run(id,revision,operation).await?)?;
        if result.state["participantIds"]!=json!(players) || result.public_state["participantIds"]!=json!(players)
            || result.state["turn"]!=result.public_state["turn"] || result.state["terminal"]!=result.public_state["terminal"]
            || result.state_hash.len()!=64 || result.required_player_ids.iter().any(|p|!players.contains(p)) {
            return Err(AppError::ComputeUnavailable);
        }
        Ok(result)
    }
    async fn read(&self,mut response:reqwest::Response)->AppResult<Value> {
        let mut bytes=Vec::new();
        while let Some(chunk)=response.chunk().await.map_err(|_|AppError::ComputeUnavailable)? {
            if bytes.len()+chunk.len()>8*1024*1024 {return Err(AppError::ComputeUnavailable);} bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(AppError::from)
    }
}
