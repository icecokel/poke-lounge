#!/usr/bin/env bash

# Prepare the OCI Ubuntu 24.04 ARM64 production host for Poke Lounge.
# Run once as root (sudo). Installs Docker Engine + Compose, git/unzip, and cloudflared.
# It does not create containers, volumes, tunnels or runner registrations.
set -euo pipefail

test "$(id -u)" = 0
. /etc/os-release
test "$ID/$VERSION_CODENAME/$(dpkg --print-architecture)" = ubuntu/noble/arm64
service_user=${SERVICE_USER:-ubuntu}
id "$service_user" >/dev/null

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git unzip

install -m 0755 -d /etc/apt/keyrings
if [ ! -s /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
  >/etc/apt/sources.list.d/docker.list

if [ ! -s /usr/share/keyrings/cloudflare-main.gpg ]; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
fi
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared noble main" \
  >/etc/apt/sources.list.d/cloudflared.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin cloudflared

# Bounded default logs for anything Compose does not configure, and keep containers
# running while dockerd itself restarts or upgrades.
install -m 0644 /dev/stdin /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true
}
JSON
systemctl enable docker.service containerd.service
systemctl restart docker.service
usermod -aG docker "$service_user"

install -m 0750 -d /etc/cloudflared
docker version --format 'docker {{.Server.Version}}'
docker compose version
cloudflared --version
