#!/usr/bin/env bash
set -euo pipefail

# Compose recreates containers on deploy. Preserve their bounded Docker logs
# before that happens, in a separate volume that `compose down -v` cannot remove.
archive_volume=poke-lounge-trace-archive
archive_image=alpine:3.20
services=(api battle-worker web migrate postgres redis)

existing=0
for service in "${services[@]}"; do
  if docker container inspect "poke-lounge-${service}-1" >/dev/null 2>&1; then
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
  container="poke-lounge-${service}-1"
  if ! docker container inspect "$container" >/dev/null 2>&1; then
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
