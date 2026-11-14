#!/usr/bin/env bash

# Register the production runner on the OCI Linux ARM64 host.
# Run as the service user (not root) after setup-oci-host.sh. Requires a repository
# runner registration token in RUNNER_TOKEN (gh api -X POST
# repos/icecokel/poke-lounge/actions/runners/registration-token --jq .token).
# Installing the systemd unit needs sudo; the script stops before that if it is unavailable.
set -euo pipefail

repo=icecokel/poke-lounge
runner_dir=${RUNNER_DIR:-$HOME/actions-runner-poke-lounge}
runner_name=${RUNNER_NAME:-oci-poke-lounge-prod-01}
version=${RUNNER_VERSION:?Set RUNNER_VERSION (for example 2.330.0)}
sha256=${RUNNER_SHA256:?Set RUNNER_SHA256 from the release notes (linux-arm64)}

test "$(uname -s)/$(uname -m)" = Linux/aarch64
test "$(id -u)" != 0
id -nG | tr ' ' '\n' | grep -qx docker
docker compose version >/dev/null

if [ ! -x "$runner_dir/config.sh" ]; then
  archive=actions-runner-linux-arm64-$version.tar.gz
  mkdir -p "$runner_dir"
  curl -fsSL -o "$runner_dir/$archive" \
    "https://github.com/actions/runner/releases/download/v$version/$archive"
  echo "$sha256  $runner_dir/$archive" | sha256sum -c -
  tar -xzf "$runner_dir/$archive" -C "$runner_dir"
  rm "$runner_dir/$archive"
fi

cd "$runner_dir"
if [ ! -f .runner ]; then
  ./config.sh --unattended --url "https://github.com/$repo" --token "${RUNNER_TOKEN:?Set RUNNER_TOKEN}" \
    --name "$runner_name" --labels poke-lounge,oci --work _work --replace
fi

if [ ! -f .service ]; then
  sudo ./svc.sh install "$(id -un)"
fi
unit=$(cat .service)
# Jobs share two OCPUs with the live game; give the runner a lower CPU share than Docker.
sudo install -m 0755 -d "/etc/systemd/system/$unit.d"
printf '[Service]\nCPUWeight=50\nNice=5\nRestart=always\nRestartSec=10\n' |
  sudo install -m 0644 /dev/stdin "/etc/systemd/system/$unit.d/override.conf"
sudo systemctl daemon-reload
sudo systemctl enable "$unit"
sudo systemctl restart "$unit"
sudo ./svc.sh status
