#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROFILES=""
image_tag=${POKE_LOUNGE_IMAGE_TAG:-local}
previous_tag=prev
if [[ "$image_tag" != local ]]; then
  previous_tag="${image_tag}-prev"
fi
images=(poke-lounge-node poke-lounge-api-rust)
saved_images=()
compose=(docker compose)
apps=(battle-worker api web)
if [[ "${LEAGUE_ENABLED:-}" == true ]]; then
  compose+=(--profile league)
fi
replace_started=0

deployment_failed() {
  local status=$1 image
  trap - ERR
  set +e
  # Restore tags even before replacement, so a failed build/migration cannot become :prev next time.
  if ((${#saved_images[@]})); then
    for image in "${saved_images[@]}"; do
      if ! docker image tag "$image:$previous_tag" "$image:$image_tag"; then
        echo "::error::Could not restore $image:$image_tag" >&2
        exit "$status"
      fi
    done
  fi
  if ((replace_started)); then
    if ((${#saved_images[@]} == ${#images[@]})); then
      echo "Deployment failed; restoring previous application images" >&2
      bash scripts/deploy/archive-poke-lounge-logs.sh || echo "::warning::Could not archive failed deployment logs" >&2
      if [[ "${LEAGUE_ENABLED:-}" == true ]]; then
        apps+=(league-judge)
      fi
      if ! "${compose[@]}" up --detach --wait --wait-timeout 180 --no-deps "${apps[@]}"; then
        echo "::error::Rollback failed; inspect application containers" >&2
      fi
    else
      echo "::error::No complete previous image pair; rollback unavailable on first deployment" >&2
    fi
  fi
  exit "$status"
}
trap 'deployment_failed "$?"' ERR

for image in "${images[@]}"; do
  if docker image inspect "$image:$image_tag" >/dev/null 2>&1; then
    docker image tag "$image:$image_tag" "$image:$previous_tag"
    saved_images+=("$image")
  fi
done

# Build sequentially to leave CPU available for the running game.
COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build
"${compose[@]}" up --detach --wait --wait-timeout 180 --no-recreate postgres redis
"${compose[@]}" run --rm --no-deps migrate
bash scripts/deploy/archive-poke-lounge-logs.sh

# Dependencies were prepared above; do not run migrate again or recreate data services.
replace_started=1
"${compose[@]}" up --detach --remove-orphans --wait --wait-timeout 180 --no-deps "${apps[@]}"
if [[ "${LEAGUE_ENABLED:-}" == true ]]; then
  "${compose[@]}" up --detach --wait --wait-timeout 180 --no-deps league-judge
fi

health_curl=(curl --fail --silent --show-error --max-time 10 --retry 5 --retry-all-errors)
api_url="http://127.0.0.1:${API_PORT:-3001}"
"${health_curl[@]}" "$api_url/health" >/dev/null
"${health_curl[@]}" "$api_url/health/ready" >/dev/null
"${health_curl[@]}" "$api_url/poke-lounge/rooms/public" >/dev/null
"${health_curl[@]}" "http://127.0.0.1:${WEB_PORT:-3000}/ko-KR" >/dev/null
if [[ "${LEAGUE_ENABLED:-}" == true ]]; then
  status=$("${health_curl[@]}" --output /dev/null --write-out '%{http_code}' "$api_url/league/v1/status")
  [[ "$status" == 200 ]]
fi
discord_values=0
for name in DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET DISCORD_REDIRECT_URI; do
  value=${!name:-}
  if [[ -n "${value//[[:space:]]/}" ]]; then
    discord_values=$((discord_values + 1))
  fi
done
if ((discord_values == 3)); then
  "${health_curl[@]}" "$api_url/auth/me" |
    python3 -c 'import json, sys; sys.exit("discord" not in json.load(sys.stdin)["data"]["providers"])'
fi
# shellcheck disable=SC2016 # Variables are expanded inside the API container.
"${compose[@]}" exec -T api sh -c \
  'test -s "$RUST_API_LOG_DIR/api.jsonl" && test "$(stat -c %a "$RUST_API_LOG_DIR/api.jsonl")" = 600 && grep -Fq "$RELEASE_SHA" "$RUST_API_LOG_DIR/api.jsonl"'
