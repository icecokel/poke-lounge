#!/usr/bin/env bash
set -euo pipefail
umask 077

if (($# != 1)) || [[ -z "$1" ]]; then
  echo "Usage: $0 <local-backup-directory>" >&2
  exit 2
fi
destination=$1
ssh_config=/Users/smlee/icecoke-ops/config/ssh-config
remote=oci-poke-lounge:backups/poke-lounge/postgres
mkdir -p -- "$destination"
chmod 700 "$destination"
destination=$(cd -- "$destination" && pwd)

# Never delete remote backups, or local copies which remote retention has removed.
if command -v rsync >/dev/null 2>&1; then
  rsync -rt --chmod=D700,F600 -e "ssh -F $ssh_config" \
    --include='*.dump' --include='*.dump.sha256' --exclude='*' \
    "$remote/" "$destination/"
else
  scp -F "$ssh_config" "$remote/*.dump" "$remote/*.dump.sha256" "$destination/"
fi

python3 - "$destination" <<'PY'
import hashlib
import pathlib
import re
import sys

directory = pathlib.Path(sys.argv[1])
dumps = sorted(directory.glob("*.dump"))
if not dumps:
    raise SystemExit("No PostgreSQL dumps received")
for path in dumps:
    checksum_path = path.with_suffix(".dump.sha256")
    path.chmod(0o600)
    checksum_path.chmod(0o600)
    match = re.fullmatch(r"([a-f0-9]{64})  (poke_lounge-\d{8}T\d{6}Z\.dump)\n?", checksum_path.read_text())
    if not match or match[2] != path.name:
        raise SystemExit(f"Invalid checksum file: {checksum_path.name}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != match[1]:
        raise SystemExit(f"Checksum mismatch: {path.name}")
for checksum_path in directory.glob("*.dump.sha256"):
    if not checksum_path.with_suffix("").is_file():
        raise SystemExit(f"Missing dump: {checksum_path.name}")
print(f"Verified SHA-256 for {len(dumps)} PostgreSQL backups")
PY
