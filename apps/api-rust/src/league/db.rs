use super::error::{LeagueError, Result};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, OwnedMutexGuard};
use tokio_postgres::{Client, NoTls};

pub struct Db {
    config: tokio_postgres::Config,
    slots: Vec<Arc<Mutex<Option<Client>>>>,
}
impl Db {
    pub fn new(config: tokio_postgres::Config, max: usize) -> Self {
        Self {
            config,
            slots: (0..max).map(|_| Arc::new(Mutex::new(None))).collect(),
        }
    }
    pub async fn client(&self) -> Result<OwnedMutexGuard<Option<Client>>> {
        let mut slot = self
            .slots
            .iter()
            .find_map(|slot| slot.clone().try_lock_owned().ok())
            .ok_or_else(LeagueError::unavailable)?;
        if slot.as_ref().is_none_or(Client::is_closed) {
            let (client, connection) =
                tokio::time::timeout(Duration::from_secs(2), self.config.connect(NoTls))
                    .await
                    .map_err(|_| LeagueError::unavailable())??;
            tokio::spawn(async move {
                if connection.await.is_err() {
                    tracing::warn!(event = "league.db_unavailable");
                }
            });
            client.batch_execute("SET statement_timeout = '3s'; SET lock_timeout = '1s'; SET idle_in_transaction_session_timeout = '5s'").await?;
            *slot = Some(client);
        }
        Ok(slot)
    }
}
pub async fn retry<T, F, Fut>(mut operation: F) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    match operation().await {
        Err(e) if e.retry => operation().await,
        result => result,
    }
}
