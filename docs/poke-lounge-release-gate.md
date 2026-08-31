# Poke Lounge Release Gate

**Audit date:** 2026-08-30
**Audit evidence:** `docs/poke-lounge-asset-provenance.json`
**Scope:** technical provenance audit based on local evidence only; not legal advice.

## Release Decision

Provenance status: UNRESOLVED

The `/[locale]/game/poke-lounge` route has 71 public asset records without verified distribution rights. This is an explicit release risk. The standalone Web build only blocks on it when `POKE_LOUNGE_PROVENANCE_STRICT=1` is set.

`pnpm check:poke-lounge-provenance` still fails because all 71 manifest rows remain `"rightsStatus": "blocked"`. The first nine rows cover the source-derived audio manifest and eight runtime files. Set `POKE_LOUNGE_PROVENANCE_STRICT=1` only in an environment where unresolved provenance should block the build.

Persistence, Socket recovery, deterministic server competition, verified-only ranking, migration, CI, test, or documentation completion does not change this decision. The technical implementation is recorded in the server stabilization and Redis plans, but it does not establish ownership, permission, license compatibility, trademark clearance, or any other legal conclusion. A human owner and appropriate legal reviewer must review the unresolved items and record the release decision.

## Competitive battle V2 technical gate

The release candidate must also satisfy the grown-party competitive battle contract independently of the provenance decision:

- each player commits a complete 1–6 member party snapshot before the preparation deadline;
- the server freezes that snapshot and creates matches with the current V2 ruleset version and hash;
- public room responses redact individual values, move loadouts, and derived internal battle stats before assignment;
- an authoritative competitive result never writes battle HP, PP, status, or progression back to the world save;
- two-player matches are `tournament-unranked` and create no verified ranking history;
- legacy V1 nonterminal rooms are closed and legacy completed rows remain audit-only.

Run `pnpm check:poke-lounge-competitive-catalog`, `pnpm check:poke-lounge-battle-resolution`, `pnpm test:poke-lounge-battle`, `pnpm test:api`, and `pnpm test:web`. PostgreSQL-backed API and browser integration gates additionally require a migrated `_test` database through `TEST_DATABASE_URL`.

## Release owner sign-off

| Release owner | Final release decision | Signed/approved at |
| ------------- | ---------------------- | ------------------ |
| Unassigned    | Risk not resolved      | Unsigned           |

No legal clearance or signed approval is recorded. Default deployment continuing must not be interpreted as asset-rights approval.

## Runtime audio derived from a local game source

- `apps/web/public/assets/poke-lounge/audio/sfx/button-confirm.mp3`
- `apps/web/public/assets/poke-lounge/audio/sfx/button-cancel.mp3`
- `apps/web/public/assets/poke-lounge/audio/sfx/battle-transition.mp3`
- `apps/web/public/assets/poke-lounge/audio/sfx/battle-start.mp3`
- `apps/web/public/assets/poke-lounge/audio/sfx/battle-hit.mp3`
- `apps/web/public/assets/poke-lounge/audio/sfx/pokemon-faint.mp3`
- `apps/web/public/assets/poke-lounge/audio/bgm/field-day.mp3`
- `apps/web/public/assets/poke-lounge/audio/bgm/wild-battle.mp3`

The files above are rendered from `data/sound/gs_sound_data.sdat` in the ignored local HeartGold Korean game source. `scripts/poke-lounge/audio-cues.json` records the SDAT sequence IDs and `scripts/poke-lounge/render-audio-cues.py` renders the MP3 files and their runtime manifest. This proves technical origin, not permission to use or distribute the files. The nine corresponding provenance rows remain `"rightsStatus": "blocked"` until a release owner records an appropriate rights decision. See [Poke Lounge Audio Sources](./poke-lounge-audio-sources.md).

## Unknown or unresolved public assets

All entries below are blocked. The full per-file inventory and SHA-256 values are in `docs/poke-lounge-asset-provenance.json`.

- Pokémon sprites: every file below `apps/web/public/assets/pokemon/front/`, `apps/web/public/assets/pokemon/back/`, `apps/web/public/assets/pokemon/battle/`, `apps/web/public/assets/pokemon/cataloged/`, and `apps/web/public/assets/pokemon/sheets/`.
- Archive-named visuals and character atlas: every file below `apps/web/public/assets/poke-lounge/dump/`, `apps/web/public/assets/poke-lounge/player/`, `apps/web/public/assets/poke-lounge/screens/`, and `apps/web/public/assets/poke-lounge/textures/`.
- Map material: `apps/web/public/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png` and `apps/web/public/maps/pokemmo-reference/town.json`.
- Game and extracted data: every file below `apps/web/public/assets/poke-lounge/extraction/` and `apps/web/public/game-data/`.

The game-data extractor under `scripts/poke-lounge/` provides local extraction evidence for the extracted records and four sprite sheets. The generated sheets also match all 30 unique legacy front/back frames byte-for-byte. This confirms technical origin but does not provide distribution rights. The audit found no local license, permission, or attribution proof for the sprite, map, texture, atlas, or gameplay-data assets.

## Approval table

| Required approval                                     | Evidence required                                                                   | Current state |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| Pokémon name/marks and gameplay data                  | Owner/legal distribution decision                                                   | Pending       |
| Runtime audio                                         | Distribution authorization or replacement/removal record, hash, and reviewer record | Pending       |
| Extracted data derived from a local game source       | Written authorization or replacement/removal record                                 | Pending       |
| Sprites, textures, atlas, PokeMMO/Tuxmon map material | Original source, license/permission, required attribution                           | Pending       |
| Poke Lounge ported code                               | Owner/contributor authorization and outbound code-license decision                  | Pending       |

Only a release owner may set a manifest row to `"rightsStatus": "approved"`; the row must then have a matching SHA-256, nonempty source, reviewer, approval timestamp, and any required attribution.
