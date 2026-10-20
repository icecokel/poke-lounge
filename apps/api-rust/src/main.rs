mod actors;
mod compute;
mod config;
mod data;
mod domain;
mod error;
mod http;
mod logging;
mod repository;
mod socket;
mod tournament;

use std::{
    process::ExitCode,
    sync::Arc,
    time::{Duration, Instant},
};

use std::collections::HashMap;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::{
    actors::Rooms,
    config::{Config, OWNER_RENEWAL},
    error::{AppError, AppResult},
    http::AppState,
    repository::Repository,
};

#[tokio::main]
async fn main() -> ExitCode {
    let _log_guard = match logging::init() {
        Ok(guard) => guard,
        Err(error) => {
            eprintln!("Persistent log initialization failed: {:?}", error.kind());
            return ExitCode::FAILURE;
        }
    };
    let started = Instant::now();
    let mut stage = "config";
    match run(&mut stage).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            // Display only the safe wrapper, not Redis connection credentials in source errors.
            let storage = error.storage_error();
            tracing::error!(event = "backend.exit", error = %error, stage,
                uptime_ms = started.elapsed().as_millis() as u64,
                storage_kind = ?storage.map(redis::RedisError::kind),
                storage_connection_refused = ?storage.map(redis::RedisError::is_connection_refusal),
                storage_timeout = ?storage.map(redis::RedisError::is_timeout),
                release = %logging::release());
            ExitCode::FAILURE
        }
    }
}

async fn run(stage: &mut &'static str) -> AppResult<()> {
    let config = Config::from_env()?;
    *stage = "listener.bind";
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .map_err(|_| AppError::Configuration("cannot bind Rust API listener"))?;
    *stage = "redis.connect";
    let repository = Repository::connect(&config.redis_url).await?;
    *stage = "compute.configure";
    let compute =
        crate::compute::Compute::new(config.worker_url.clone(), config.worker_token.clone())?;
    *stage = "compute.ready";
    compute.ready().await?;
    *stage = "database.connect";
    let data = crate::data::Data::connect(config.database.clone()).await?;
    *stage = "owner.acquire";
    repository.acquire().await?;
    let shutdown = CancellationToken::new();
    let lease_stop = CancellationToken::new();
    let rooms = Rooms::new(repository.clone(), compute.clone(), shutdown.clone());
    let lease_task = {
        let repository = repository.clone();
        let shutdown = shutdown.clone();
        let lease_stop = lease_stop.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(OWNER_RENEWAL);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    biased;
                    _ = lease_stop.cancelled() => return false,
                    _ = interval.tick() => {
                        let started = Instant::now();
                        if let Err(error) = repository.renew().await {
                            let storage = error.storage_error();
                            tracing::error!(event = "backend.owner_lost", reason = %error,
                                elapsed_ms = started.elapsed().as_millis() as u64,
                                storage_kind = ?storage.map(redis::RedisError::kind),
                                storage_connection_refused = ?storage.map(redis::RedisError::is_connection_refusal),
                                storage_timeout = ?storage.map(redis::RedisError::is_timeout),
                                release = %logging::release(), "Owner renewal failed; stopping with an uncertain owner lease");
                            shutdown.cancel();
                            return true;
                        }
                    }
                }
            }
        })
    };
    *stage = "rooms.restore";
    if let Err(error) = rooms.restore().await {
        shutdown.cancel();
        let drained = rooms.drain().await;
        lease_stop.cancel();
        let _ = lease_task.await;
        if drained {
            let _ = repository.release().await;
        }
        return Err(error);
    }
    let recovery_task = {
        let rooms = rooms.clone();
        let shutdown = shutdown.clone();
        tokio::spawn(async move {
            let mut timer = tokio::time::interval(Duration::from_secs(5));
            timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    biased;
                    _ = shutdown.cancelled() => break,
                    _ = timer.tick() => {
                        let started = Instant::now();
                        if let Err(error) = rooms.restore().await {
                            let storage = error.storage_error();
                            tracing::warn!(event = "backend.recovery_failed", reason = %error,
                                elapsed_ms = started.elapsed().as_millis() as u64,
                                storage_kind = ?storage.map(redis::RedisError::kind),
                                storage_connection_refused = ?storage.map(redis::RedisError::is_connection_refusal),
                                storage_timeout = ?storage.map(redis::RedisError::is_timeout),
                                release = %logging::release());
                        }
                    }
                }
            }
        })
    };
    let signal_task = {
        let shutdown = shutdown.clone();
        tokio::spawn(async move {
            wait_for_shutdown_signal().await;
            shutdown.cancel();
        })
    };
    let state = AppState {
        repository: repository.clone(),
        rooms: rooms.clone(),
        shutdown: shutdown.clone(),
        started: Instant::now(),
        compute,
        data,
        sockets: Arc::new(Semaphore::new(128)),
        origins: Arc::new(config.allowed_origins.clone()),
        budgets: Arc::new(Mutex::new(HashMap::new())),
        requests: Arc::new(Semaphore::new(64)),
        release: logging::release(),
    };
    let router = http::router(state, &config);
    *stage = "serving";
    tracing::info!(event = "backend.started", bind = %config.bind, protocol = "rust-game-v2", release = %logging::release());
    let server = axum::serve(
        listener,
        router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.clone().cancelled_owned());
    let mut server = std::pin::pin!(std::future::IntoFuture::into_future(server));
    let served = tokio::select! {
        result = &mut server => Some(result),
        _ = shutdown.cancelled() => {
            // Do not hang forever on an idle HTTP connection during shutdown.
            tokio::time::timeout(Duration::from_secs(15), &mut server).await.ok()
        }
    };
    shutdown.cancel();
    *stage = "shutdown.drain";
    let drained = rooms.drain().await;
    let _ = recovery_task.await;
    signal_task.abort();
    lease_stop.cancel();
    let owner_lost = lease_task.await.unwrap_or(true);
    if drained {
        *stage = "owner.release";
        repository.release().await?;
    } else {
        // Do not release ownership while a command could still be finishing a write.
        tracing::error!(event = "backend.drain_timeout");
        return Err(AppError::Unavailable);
    }
    tracing::info!(event = "backend.stopped");
    if owner_lost {
        *stage = "owner.renew";
        return Err(AppError::Unavailable);
    }
    *stage = "server.stop";
    served
        .ok_or(AppError::Unavailable)?
        .map_err(|_| AppError::Unavailable)
}

async fn wait_for_shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => (),
                    _ = terminate.recv() => (),
                }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
