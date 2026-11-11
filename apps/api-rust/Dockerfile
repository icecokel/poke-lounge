# syntax=docker/dockerfile:1
FROM rust:1.98.1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
# Dependency layer: build every crate from Cargo.lock against a placeholder main so this layer is
# reused until a manifest or the toolchain changes. Source edits only rebuild the last layer.
COPY apps/api-rust/Cargo.toml apps/api-rust/Cargo.toml
RUN mkdir -p apps/api-rust/src \
    && echo 'fn main() {}' > apps/api-rust/src/main.rs \
    && cargo build --locked --release --package poke-lounge-api-rust
COPY apps/api-rust apps/api-rust
# COPY keeps the checkout's mtime, which can be older than the placeholder build; touch main.rs so
# cargo always rebuilds the real binary.
RUN touch apps/api-rust/src/main.rs \
    && cargo build --locked --release --package poke-lounge-api-rust

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home rust-api \
    && install -d -m 0700 -o rust-api -g rust-api /var/log/poke-lounge
COPY --from=builder /app/target/release/poke-lounge-api-rust /usr/local/bin/poke-lounge-api-rust
USER 10001
EXPOSE 3011
ENTRYPOINT ["/usr/local/bin/poke-lounge-api-rust"]
