# syntax=docker/dockerfile:1
FROM rust:1.98.1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY apps/api-rust apps/api-rust
RUN cargo build --locked --release --package poke-lounge-api-rust

FROM debian:bookworm-slim
RUN useradd --system --uid 10001 --no-create-home rust-api
COPY --from=builder /app/target/release/poke-lounge-api-rust /usr/local/bin/poke-lounge-api-rust
USER 10001
EXPOSE 3011
ENTRYPOINT ["/usr/local/bin/poke-lounge-api-rust"]
