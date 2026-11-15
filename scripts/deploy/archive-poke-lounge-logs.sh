#!/usr/bin/env bash
set -euo pipefail

# Preserve logs only when an application's image or Compose configuration will change.
archive_volume=${POKE_LOUNGE_ARCHIVE_VOLUME:-poke-lounge-trace-archive}
archive_image=alpine:3.20
project=${COMPOSE_PROJECT_NAME:-poke-lounge}
services=(api battle-worker web)
compose=(docker compose)
if [[ "${LEAGUE_ENABLED:-}" == true ]]; then
  services+=(league-judge)
  compose+=(--profile league)
fi

existing=0
for service in "${services[@]}"; do
  if docker container inspect "${project}-${service}-1" >/dev/null 2>&1; then
    existing=1
    break
  fi
done
if ((existing == 0)); then
  echo "No previous Poke Lounge containers to archive"
  exit 0
fi

docker volume create "$archive_volume" >/dev/null
stamp=$(date -u +%Y%m%dT%H%M%SZ)
for service in "${services[@]}"; do
  container="${project}-${service}-1"
  if ! docker container inspect "$container" >/dev/null 2>&1; then
    continue
  fi
  image=$("${compose[@]}" config --format json "$service" |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["services"][sys.argv[1]]["image"])' "$service")
  # Compose compares platform images; build attestations can change only the image index.
  platform=$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$image")
  image_id=$(docker image inspect --platform "$platform" -f '{{.Id}}' "$image")
  current_image_id=$(docker container inspect -f '{{index .Config.Labels "com.docker.compose.image"}}' "$container")
  config_hash=$("${compose[@]}" config --hash "$service")
  current_config_hash=$(docker container inspect -f '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$container")
  if [[ "$image_id" == "$current_image_id" && "${config_hash#* }" == "$current_config_hash" ]]; then
    echo "Keeping ${service} container; no log archive needed"
    continue
  fi
  container_id=$(docker container inspect -f '{{.Id}}' "$container")
  filename="${stamp}-${service}-${container_id:0:12}.log.gz"
  docker logs --timestamps "$container" 2>&1 |
    docker run --rm -i -v "$archive_volume:/archive" "$archive_image" \
      sh -c 'gzip > "/archive/$1"' sh "$filename"
  echo "Archived ${service} logs as ${filename}"
done

# Prune old archives only after the current containers have been captured.
docker run --rm -v "$archive_volume:/archive" "$archive_image" \
  sh -c 'find /archive -type f -name "*.log.gz" -mtime +30 -exec rm -f {} \;'
