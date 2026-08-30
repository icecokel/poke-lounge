#!/usr/bin/env bash

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

runner_dir=/home/icenux/actions-runner-poke-lounge

test -x "$runner_dir/svc.sh"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker.service containerd.service

cd "$runner_dir"
if [ ! -f .service ]; then
  ./svc.sh install icenux
fi

runner_service=$(cat .service)
install -D -m 0644 "$(dirname "$0")/runner-docker.conf" \
  "/etc/systemd/system/${runner_service}.d/docker.conf"
systemctl daemon-reload
./svc.sh start

docker version
docker compose version
./svc.sh status
