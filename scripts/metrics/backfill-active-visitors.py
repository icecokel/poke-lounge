#!/usr/bin/env python3
"""Summarize or backfill anonymous game activity from Rust API JSON logs on stdin."""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from uuid import UUID


PLAYER_ID = re.compile(
    r"^server-player-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
    re.IGNORECASE,
)
ACTIVITY_EVENTS = {"socket.connected", "socket.closed", "room.command", "room.command_replayed"}
KST = timezone(timedelta(hours=9))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", action="store_true", help="emit idempotent PostgreSQL backfill SQL")
    args = parser.parse_args()
    rows: set[tuple[str, str]] = set()
    for line in sys.stdin:
        try:
            event = json.loads(line[line.index("{") :])
            fields = event["fields"]
            match = PLAYER_ID.fullmatch(fields.get("player_id", ""))
            if fields.get("event") not in ACTIVITY_EVENTS or not match:
                continue
            timestamp = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                continue
            visitor = UUID(match.group(1))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
        rows.add((timestamp.astimezone(KST).date().isoformat(), hashlib.sha256(visitor.bytes).hexdigest()))

    if args.sql:
        print("BEGIN;")
        print(
            "CREATE TABLE IF NOT EXISTS poke_lounge_active_visitor ("
            "activity_date date NOT NULL, visitor_hash char(64) NOT NULL, "
            "CONSTRAINT \"PK_poke_lounge_active_visitor\" PRIMARY KEY (activity_date, visitor_hash), "
            "CONSTRAINT \"CHK_poke_lounge_active_visitor_hash\" CHECK (visitor_hash ~ '^[0-9a-f]{64}$'));"
        )
        for day, visitor_hash in sorted(rows):
            print(
                "INSERT INTO poke_lounge_active_visitor (activity_date, visitor_hash) "
                f"VALUES ('{day}', '{visitor_hash}') ON CONFLICT DO NOTHING;"
            )
        print("COMMIT;")
    else:
        by_day: dict[str, int] = {}
        for day, _ in rows:
            by_day[day] = by_day.get(day, 0) + 1
        for day, count in sorted(by_day.items()):
            print(f"{day}\t{count}")
        print(f"total distinct date-browser rows: {len(rows)}")


if __name__ == "__main__":
    main()
