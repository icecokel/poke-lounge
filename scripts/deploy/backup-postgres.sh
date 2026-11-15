#!/usr/bin/env bash
set -euo pipefail
umask 077

postgres_container=${POKE_LOUNGE_POSTGRES_CONTAINER:-poke-lounge-prod-postgres-1}
backup_dir=${POKE_LOUNGE_BACKUP_DIR:-$HOME/backups/poke-lounge/postgres}
backup_dir=${backup_dir%/}
backup_root=$(dirname -- "$backup_dir")
postgres_image=postgres:16-alpine@sha256:f377d590e5474681d4d7838635031a2b50647923b7abfa803ce9b5ff35d5c663
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="$backup_dir/poke_lounge-$stamp.dump"
temporary_dump=
temporary_checksum=
lock_dir="$backup_root/.postgres-backup.lock"
locked=0
publish_started=0
published=0
stage=prepare

mkdir -p "$backup_dir"
chmod 700 "$backup_root" "$backup_dir"
touch "$backup_root/backup.log"
chmod 600 "$backup_root/backup.log"

finish() {
  local status=$?
  trap - EXIT
  set +e
  [[ -z "$temporary_dump" ]] || rm -f -- "$temporary_dump" || status=1
  [[ -z "$temporary_checksum" ]] || rm -f -- "$temporary_checksum" || status=1
  if ((locked)); then
    if ((publish_started && published == 0)); then
      rm -f -- "$dump_file" "$dump_file.sha256" || status=1
    fi
    rmdir "$lock_dir" || status=1
  fi
  printf '%s status=%s stage=%s file=%s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$status" "$stage" "${dump_file##*/}" >> "$backup_root/backup.log" || status=1
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stage=lock
mkdir "$lock_dir"
locked=1
# A second invocation in the same second must not replace a completed backup.
if [[ -e "$dump_file" || -e "$dump_file.sha256" ]]; then
  exit 1
fi
command -v python3 >/dev/null
stage=disk
available_kib=$(df -Pk "$backup_dir" | awk 'NR == 2 { print $4 }')
if [[ ! "$available_kib" =~ ^[0-9]+$ ]] || ((available_kib < 5 * 1024 * 1024)); then
  exit 1
fi

stage=dump
temporary_dump=$(mktemp "$backup_dir/.dump.XXXXXX")
# The official image trusts local Unix sockets; no host or password is passed.
docker exec "$postgres_container" pg_dump -U poke_lounge -d poke_lounge -Fc --no-password > "$temporary_dump"
test -s "$temporary_dump"
stage=validate
docker run --rm --network none -i "$postgres_image" pg_restore --list < "$temporary_dump" >/dev/null

stage=checksum
temporary_checksum=$(mktemp "$backup_dir/.sha256.XXXXXX")
if command -v sha256sum >/dev/null 2>&1; then
  checksum=$(sha256sum "$temporary_dump")
else
  checksum=$(shasum -a 256 "$temporary_dump")
fi
printf '%s  %s\n' "${checksum%% *}" "${dump_file##*/}" > "$temporary_checksum"
chmod 600 "$temporary_dump" "$temporary_checksum"
stage=publish
publish_started=1
mv -- "$temporary_dump" "$dump_file"
mv -- "$temporary_checksum" "$dump_file.sha256"
published=1

stage=retention
# Redis only holds rooms with a maximum two-hour lifetime, so it is not backed up.
python3 - "$backup_dir" <<'PY'
import datetime as dt
import pathlib
import re
import sys

directory = pathlib.Path(sys.argv[1])
today = dt.datetime.now(dt.timezone.utc).date()
cutoff = today - dt.timedelta(weeks=8)
backups = []
for path in directory.glob("poke_lounge-*.dump"):
    match = re.fullmatch(r"poke_lounge-(\d{8}T\d{6}Z)\.dump", path.name)
    if match and path.is_file():
        stamp = dt.datetime.strptime(match[1], "%Y%m%dT%H%M%SZ").date()
        backups.append((path, stamp))
backups.sort(key=lambda entry: entry[0].name, reverse=True)
keep = {path for path, _ in backups[:14]}
sundays = set()
for path, day in backups:
    if cutoff <= day <= today and day.weekday() == 6 and day not in sundays and len(sundays) < 8:
        keep.add(path)
        sundays.add(day)
for path, _ in backups:
    if path not in keep:
        path.unlink()
        path.with_suffix(".dump.sha256").unlink(missing_ok=True)
PY
stage=complete
