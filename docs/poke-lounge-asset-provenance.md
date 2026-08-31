# Poke Lounge Asset Provenance

## Status

**Public release risk is unresolved.** The default standalone Web build does not enforce this audit, but Poke Lounge still has unresolved rights records for Pokémon names/marks, game data and sprite sheets derived from a local game source, and third-party-labelled visual and map material.

This document is a technical provenance audit based on local repository evidence. It is not legal advice and does not clear any asset for use or distribution.

The completed server-authority and durability work has no effect on the provenance status. Only documented owner decisions, appropriate legal review, approved per-file evidence, and release-owner sign-off can resolve it.

## Evidence status

- **Confirmed source-derived:** local scripts/manifests directly identify a HeartGold game source package or its SDAT data as input.
- **Unknown provenance:** no local license, permission, attribution, or authorship evidence was found for the shipped file.
- **Owner decision required:** technical evidence is insufficient to decide distribution rights; the human owner must authorize, replace, or remove the item.

## Inventory

| Area                                  | Exact paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Evidence status                                                         | Technical evidence and required decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application/API code                  | `apps/web/src/components/poke-lounge/`, `apps/web/src/app/[locale]/game/poke-lounge/page.tsx`, `apps/api/src/poke-lounge/`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner decision required                                                 | The code was migrated from the local VSCoke repository into this standalone repository. There is no repository/root code license, attribution header, or documented transfer authorization. Confirm ownership/contributor rights and choose an outbound code-license policy.                                                                                                                                                                                                                                                                                        |
| Pokémon names and game-data extractor | The game-data extractor under `scripts/poke-lounge/`, `apps/web/src/components/poke-lounge/runtime/starter-selection.ts`, `apps/web/src/components/poke-lounge/runtime/game/battle/`                                                                                                                                                                                                                                                                                                                                                                                         | Confirmed local extraction evidence; owner decision required            | The extractor parses NARC data into personal, move, growth, and evolution records. The runtime and route use Pokémon-specific concepts and names. Decide whether the marks and the gameplay/data representation may be publicly used.                                                                                                                                                                                                                                                                                                                               |
| Public extracted records              | `apps/web/public/assets/poke-lounge/extraction/personal-data.json`, `apps/web/public/assets/poke-lounge/extraction/refined-battle-records.json`, `apps/web/public/assets/poke-lounge/extraction/growth-table.json`                                                                                                                                                                                                                                                                                                                                                           | Confirmed source-derived                                                | The extraction script and Poke Lounge plans establish source-record input; the public JSON files contain no license, permission, or attribution record. Authorize, replace, or remove before release.                                                                                                                                                                                                                                                                                                                                                               |
| Public gameplay data                  | `apps/web/public/game-data/pokemon-data.json`, `apps/web/public/game-data/level-up-move-table.json`, `apps/web/public/game-data/wild-encounter-tables.json`, `apps/web/public/game-data/wild-battle-move-sets.json`, `apps/web/public/game-data/battle-pokemon-assets.json`, `apps/web/public/game-data/battle-screen-assets.json`, `apps/web/public/game-data/bootstrap.json`                                                                                                                                                   | Confirmed local extraction evidence; owner decision required            | `apps/web/src/components/poke-lounge/runtime/game/data/game-data-json.ts` loads these files. They have no shipped provenance or license record.                                                                                                                                                                                                                                                                                                                                              |
| Pokémon sprites                       | `apps/web/public/assets/pokemon/front/`, `apps/web/public/assets/pokemon/back/`, `apps/web/public/assets/pokemon/battle/`, `apps/web/public/assets/pokemon/cataloged/`, `apps/web/public/assets/pokemon/sheets/`                                                                                                                                                                                                                                                                                                                                                             | Confirmed source-derived; owner decision required                       | The four 493-species front/back sheets are reproducibly extracted from the local HeartGold game source by the game-data extractor under `scripts/poke-lounge/`. All 30 unique legacy front/back frames match the generated sheet frames byte-for-byte; the remaining legacy paths are duplicate copies of those frames. This establishes technical origin, not distribution rights. Authorize, replace, or remove before release.                                                                                                                                   |
| Archive-named textures/screens        | `apps/web/public/assets/poke-lounge/dump/pbr_winframe.narc/file_0000_pal_0024.png`, `apps/web/public/assets/poke-lounge/screens/pbr_b_plist_gra.narc/screen_0010_gfx_0022_pal_0023.png`, `apps/web/public/assets/poke-lounge/textures/a_0_7_0_0093/tmfl04_door1.png`, `apps/web/public/assets/poke-lounge/textures/a_0_8_1_0039/gentleman_5.png`, `apps/web/public/assets/poke-lounge/textures/a_0_8_1_0132/shopm1_5.png`, `apps/web/public/assets/poke-lounge/textures/a_0_8_1_0133/pcwoman1_5.png`, `apps/web/public/assets/poke-lounge/textures/a_0_8_1_0184/mania_5.png` | Unknown provenance, high source-origin concern; owner decision required | Archive/NARC-style names and the documented extraction workflow are evidence of likely origin, but no released file carries a rights record. Do not treat a renamed public path as clearance.                                                                                                                                                                                                                                                                                                                                                                       |
| Character and map assets              | `apps/web/public/assets/poke-lounge/player/hero-atlas.png`, `apps/web/public/assets/poke-lounge/player/hero-atlas.json`, `apps/web/public/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png`, `apps/web/public/maps/pokemmo-reference/town.json`                                                                                                                                                                                                                                                                                                             | Unknown provenance; owner decision required                             | No local author, source, license, or attribution proof was found. The `pokemmo-reference` and `tuxmon` names are not a license grant. Identify the original source and required attribution or replace the files.                                                                                                                                                                                                                                                                                                                                                   |
| Public audio                          | `apps/web/public/assets/poke-lounge/audio/audio-manifest.json`, `apps/web/public/assets/poke-lounge/audio/sfx/*.mp3`, `apps/web/public/assets/poke-lounge/audio/bgm/*.mp3`                                                                                                                                                                                                                                                                                                                                                                                                   | Confirmed source-derived; owner decision required                       | The eight runtime MP3 files are rendered from `data/sound/gs_sound_data.sdat` in the local HeartGold Korean game source. `scripts/poke-lounge/audio-cues.json` identifies every sequence, and `scripts/poke-lounge/render-audio-cues.py` renders the files and writes their source metadata to `audio-manifest.json`. This establishes technical origin only; no distribution-rights record is present. Authorize, replace, or remove before public release. [Poke Lounge Audio Sources](./poke-lounge-audio-sources.md) records the mapping and regeneration path. |

## Current release control

- `private: true` in `package.json` and `apps/web/package.json`, ignored raw-source directories, and the absence of legacy extraction-prefixed public assets are not IP clearance.
- `scripts/poke-lounge/audio-cues.json` and `scripts/poke-lounge/render-audio-cues.py` are the current source-audio regeneration path. They require ignored local game-source inputs and record technical provenance only, not permission to distribute their output.
- Runtime source still contains extraction path references in legacy conversion and asset helper modules. These references should be removed or documented when the underlying feature is removed or cleared.

## Machine-checkable release manifest

`docs/poke-lounge-asset-provenance.json` records all 71 audited public files with local SHA-256 values. The audio manifest and eight source-derived audio rows are `blocked` until a release owner records a rights decision; the other 62 rows also remain `blocked`. `pnpm check:poke-lounge-provenance` validates the public-file coverage, hashes, source record, approval fields, and attribution fields. The command remains intentionally strict, but the default Web build only enforces it when `POKE_LOUNGE_PROVENANCE_STRICT=1` is set.

After the owner makes decisions, define `docs/poke-lounge-asset-provenance.schema.json` and validate the manifest against it. A minimum JSON Schema shape is:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "assets"],
  "properties": {
    "version": { "const": 1 },
    "assets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "path",
          "sha256",
          "category",
          "evidenceStatus",
          "source",
          "licenseOrPermission",
          "requiredAttribution",
          "ownerDecision",
          "reviewedBy",
          "reviewedAt"
        ],
        "properties": {
          "path": { "type": "string", "pattern": "^apps/web/public/" },
          "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
          "category": { "enum": ["code", "name_data", "image_texture_map", "audio"] },
          "evidenceStatus": {
            "enum": [
              "confirmed_local_source_derived",
              "unknown_provenance",
              "owner_decision_required"
            ]
          },
          "source": { "type": "string" },
          "licenseOrPermission": { "type": "string" },
          "requiredAttribution": { "type": "string" },
          "ownerDecision": { "enum": ["pending", "replace", "remove", "approved"] },
          "reviewedBy": { "type": ["string", "null"] },
          "reviewedAt": { "type": ["string", "null"], "format": "date-time" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

Required validation rules:

1. `path` must resolve to one tracked public Poke Lounge file and `sha256` must match its bytes.
2. `category` must be one of `code`, `name_data`, `image_texture_map`, or `audio`.
3. `evidenceStatus` must be one of `confirmed_local_source_derived`, `unknown_provenance`, or `owner_decision_required`.
4. `ownerDecision` may be `pending`, `replace`, `remove`, or `approved`; `approved` requires a non-empty `licenseOrPermission`, `reviewedBy`, and `reviewedAt`.
5. CI must fail public release when a Poke Lounge asset lacks a row, has a hash mismatch, remains `pending`, or requires attribution that is not emitted in the release notice.
