use file_rotate::{ContentLimit, FileRotate, compression::Compression, suffix::AppendCount};
use std::{fs::OpenOptions, io, os::unix::fs::OpenOptionsExt, path::PathBuf};
use tracing_appender::non_blocking::{NonBlockingBuilder, WorkerGuard};
use tracing_subscriber::{
    EnvFilter,
    fmt::writer::{BoxMakeWriter, MakeWriterExt},
};

pub fn init() -> io::Result<Option<WorkerGuard>> {
    let (writer, guard) = match std::env::var_os("RUST_API_LOG_DIR") {
        Some(directory) => {
            let directory = PathBuf::from(directory);
            std::fs::create_dir_all(&directory)?;
            let path = directory.join("api.jsonl");
            // Fail startup if the persistent volume cannot be written, rather than silently losing it.
            OpenOptions::new()
                .create(true)
                .append(true)
                .mode(0o600)
                .open(&path)?;
            let file = FileRotate::new(
                path,
                AppendCount::new(24),
                // Preserve complete JSON records at rotation boundaries.
                ContentLimit::BytesSurpassed(20 * 1024 * 1024),
                Compression::OnRotate(2),
                Some(
                    OpenOptions::new()
                        .create(true)
                        .append(true)
                        .mode(0o600)
                        .clone(),
                ),
            );
            let (file, guard) = NonBlockingBuilder::default().lossy(false).finish(file);
            (BoxMakeWriter::new(io::stdout.and(file)), Some(guard))
        }
        None => (BoxMakeWriter::new(io::stdout), None),
    };
    tracing_subscriber::fmt()
        .json()
        .with_writer(writer)
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    Ok(guard)
}

pub fn release() -> String {
    std::env::var("RELEASE_SHA")
        .ok()
        .filter(|value| value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .unwrap_or_else(|| "local".into())
}
