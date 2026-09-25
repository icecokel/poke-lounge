use std::{env,net::SocketAddr,time::Duration};
use axum::http::HeaderValue;
use crate::error::{AppError,AppResult};
pub const REDIS_PREFIX:&str="poke-lounge:{rust-v2}";
pub const MAX_ROOMS:usize=20;
pub const MAX_ACTORS:usize=64;
pub const MAILBOX_CAPACITY:usize=64;
pub const IO_TIMEOUT:Duration=Duration::from_secs(2);
pub const REQUEST_TIMEOUT:Duration=Duration::from_secs(10);
pub const OWNER_LEASE_MS:u64=15_000;
pub const OWNER_RENEWAL:Duration=Duration::from_secs(3);
pub struct Config {pub bind:SocketAddr,pub redis_url:String,pub worker_url:String,pub worker_token:String,pub allowed_origins:Vec<HeaderValue>,pub database:tokio_postgres::Config}
impl Config {
    pub fn from_env()->AppResult<Self>{
        let bind=env::var("RUST_API_BIND_ADDR").unwrap_or_else(|_|"127.0.0.1:3011".into()).parse::<SocketAddr>().map_err(|_|AppError::Configuration("Invalid RUST_API_BIND_ADDR"))?;
        if !bind.ip().is_loopback()&&env::var("RUST_API_ALLOW_REMOTE").as_deref()!=Ok("true"){return Err(AppError::Configuration("Remote binding requires explicit opt-in"));}
        let redis_url=env::var("RUST_API_REDIS_URL").map_err(|_|AppError::Configuration("RUST_API_REDIS_URL required"))?;
        let worker_url=env::var("BATTLE_WORKER_URL").unwrap_or_else(|_|"http://127.0.0.1:3021".into());
        let worker_token=env::var("BATTLE_WORKER_TOKEN").ok().or_else(||std::fs::read_to_string(env::var("BATTLE_WORKER_TOKEN_FILE").unwrap_or_else(|_|"/run/poke-private/token".into())).ok()).ok_or(AppError::Configuration("Private worker token required"))?.trim().to_string();
        if worker_token.len()<32||worker_token.len()>256||!worker_token.is_ascii(){return Err(AppError::Configuration("Invalid private worker token"));}
        let mut allowed_origins=Vec::new();
        for origin in env::var("CORS_ORIGINS").unwrap_or_else(|_|"http://localhost:3000,http://127.0.0.1:3000".into()).split(',').map(str::trim){
            let uri:axum::http::Uri=origin.parse().map_err(|_|AppError::Configuration("Invalid CORS origin"))?;
            if !matches!(uri.scheme_str(),Some("http"|"https"))||uri.authority().is_none()||uri.path_and_query().is_some_and(|p|p.as_str()!="/")||origin.ends_with('/')||origin.contains('@'){return Err(AppError::Configuration("CORS requires exact origins"));}
            allowed_origins.push(HeaderValue::from_str(origin).map_err(|_|AppError::Configuration("Invalid CORS header"))?);
        }
        let mut database=tokio_postgres::Config::new();
        database.host(&env::var("DB_HOST").unwrap_or_else(|_|"127.0.0.1".into())).port(env::var("DB_PORT").unwrap_or_else(|_|"5432".into()).parse().map_err(|_|AppError::Configuration("Invalid DB_PORT"))?)
            .user(&env::var("DB_USERNAME").unwrap_or_else(|_|"poke_lounge".into())).password(env::var("DB_PASSWORD").map_err(|_|AppError::Configuration("DB_PASSWORD required"))?)
            .dbname(&env::var("DB_DATABASE").unwrap_or_else(|_|"poke_lounge".into())).connect_timeout(IO_TIMEOUT).options("-c statement_timeout=3000");
        Ok(Self{bind,redis_url,worker_url,worker_token,allowed_origins,database})
    }
}
