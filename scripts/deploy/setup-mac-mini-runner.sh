#!/usr/bin/env bash

# Register the production deploy runner on the Mac mini (macOS arm64 + OrbStack).
# Run as the login user, not root. Requires `gh` with admin access to the repo.
set -euo pipefail

repo=icecokel/poke-lounge
runner_dir=${RUNNER_DIR:-$HOME/actions-runner-poke-lounge}
runner_name=${RUNNER_NAME:-poke-lounge-mac-mini}
docker_socket=$HOME/.orbstack/run/docker.sock
plugin_dir=/Applications/OrbStack.app/Contents/MacOS/xbin

test "$(uname -s)/$(uname -m)" = Darwin/arm64
test -S "$docker_socket"
test -x "$plugin_dir/docker-compose"
command -v gh docker >/dev/null

if [ ! -x "$runner_dir/config.sh" ]; then
  version=$(gh api repos/actions/runner/releases/latest --jq .tag_name)
  version=${version#v}
  archive=actions-runner-osx-arm64-$version.tar.gz
  expected=$(gh api "repos/actions/runner/releases/tags/v$version" --jq .body |
    sed -n 's/.*<!-- BEGIN SHA osx-arm64 -->\([0-9a-f]\{64\}\)<!-- END SHA osx-arm64 -->.*/\1/p')
  mkdir -p "$runner_dir"
  curl -fsSL -o "$runner_dir/$archive" \
    "https://github.com/actions/runner/releases/download/v$version/$archive"
  echo "$expected  $runner_dir/$archive" | shasum -a 256 -c -
  tar -xzf "$runner_dir/$archive" -C "$runner_dir"
  rm "$runner_dir/$archive"
fi

cd "$runner_dir"
if [ ! -f .runner ]; then
  token=$(gh api -X POST "repos/$repo/actions/runners/registration-token" --jq .token)
  PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.orbstack/bin:/usr/bin:/bin:/usr/sbin:/sbin \
    ./config.sh --unattended --url "https://github.com/$repo" --token "$token" \
    --name "$runner_name" --labels poke-lounge,mac-mini --work _work --replace
fi

# Talk to OrbStack directly with a config that has no keychain credsStore:
# a launchd job cannot unlock the login keychain, and every image is public.
mkdir -p .docker
printf '{\n  "cliPluginsExtraDirs": ["%s"]\n}\n' "$plugin_dir" >.docker/config.json
printf 'LANG=C.UTF-8\nDOCKER_HOST=unix://%s\nDOCKER_CONFIG=%s/.docker\n' \
  "$docker_socket" "$runner_dir" >.env

if [ ! -f .service ]; then
  ./svc.sh install
fi
./svc.sh start

DOCKER_HOST=unix://$docker_socket DOCKER_CONFIG=$runner_dir/.docker docker compose version
./svc.sh status
