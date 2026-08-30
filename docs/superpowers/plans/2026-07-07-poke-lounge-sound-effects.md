# Poke Lounge Sound Effects Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Use superpowers:verification-before-completion before claiming extraction, conversion, browser playback, merge, or deployment is complete.

**Goal:** 롬파일에서 포케라운지에 필요한 효과음을 추출하고, 모든 주요 브라우저에서 재생 가능한 가벼운 포맷으로 변환한 뒤, 포케라운지 전투/조작 이벤트에 효과음을 적용한다.

**Architecture:** ROM/SDAT/raw subfile은 로컬 ignored 영역에서만 다룬다. 추출 파이프라인은 `data/roms`의 NDS 롬을 입력으로 SDAT catalog/subfile을 만들고, 선택된 cue만 WAV로 렌더링한 뒤 MP3로 변환한다. 웹 앱은 public audio manifest와 MP3 파일만 로드하며, 사용자 입력 이후 오디오 컨텍스트를 prime하고 이벤트별 SFX를 fire-and-forget 방식으로 재생한다.

**Tech Stack:** Python extraction scripts, external NDS SDAT/SSEQ decoder, ffmpeg, Next.js app router, Phaser, TypeScript, Playwright E2E.

## Current Local Context

- ROM path: `data/roms/포켓몬스터 하트골드(K).nds`
- ROM/raw extraction directories must stay ignored: `data/roms/`, `data/processed/rom-sound/`, `data/processed/rom-extraction/`, `data/processed/poke-lounge-audio/`
- Original project reference: `/Users/smlee/Documents/poke-lounge`
- Existing reference tools:
  - `/Users/smlee/Documents/poke-lounge/tools/rom_extract_sdat_catalog.py`
  - `/Users/smlee/Documents/poke-lounge/tools/rom_export_sdat_subfiles.py`
- Existing app audio bridge:
  - `apps/web/src/components/poke-lounge/runtime/game/battle/battleAudio.ts`
  - `apps/web/src/components/poke-lounge/runtime/game/rom-web-conversion.ts`
- `ffmpeg` is available locally.
- A real NDS SDAT/SSEQ decoder is still required. The current Python tools can extract SDAT metadata and raw subfiles, but raw `.bin`/SDAT/SSEQ data is not browser-playable audio.

## Global Constraints

- Do not ship the ROM, SDAT archives, raw extracted subfiles, or intermediate WAV files.
- Commit only app code, manifests, scripts, docs, and final approved lightweight browser audio assets.
- Before committing extracted audio assets, confirm distribution rights. If rights are not acceptable, keep ROM-derived assets local and replace committed SFX with generated or original project-owned effects.
- Use MP3 as the first-pass committed format for maximum browser compatibility and small size.
- Target mono MP3 at 44.1 kHz, 64-96 kbps depending on cue length and quality.
- Keep first-pass Poke Lounge SFX budget below 500 KB total.
- Audio playback must not block gameplay or scene transitions.
- Audio must fail silently in unsupported or autoplay-blocked contexts.
- New files must use kebab-case names.

---

### Task 1: Local Extraction Pipeline

**Files:**

- Add: `scripts/poke-lounge/extract-sdat-catalog.py`
- Add: `scripts/poke-lounge/export-sdat-subfiles.py`
- Add: `scripts/poke-lounge/audio-cues.json`
- Modify: `package.json`

**Interfaces:**

- `audio-cues.json` maps stable app SFX ids to ROM cue metadata:
  - `id`
  - `sourceArchive`
  - `sequenceName`
  - `sequenceIndex`
  - `fileId`
  - `kind`
  - `trimStartMs`
  - `durationMs`
  - `gainDb`
  - `outputFile`
- Extraction output stays under `data/processed/poke-lounge-audio/`.

- [ ] Port the two original SDAT extraction scripts into this repo with no dependency on `/Users/smlee/Documents/poke-lounge`.
- [ ] Add a package script such as `poke-lounge:audio:extract`.
- [ ] Verify the script fails clearly when `data/roms/포켓몬스터 하트골드(K).nds` is missing.
- [ ] Generate local catalog/subfile outputs under `data/processed/poke-lounge-audio/raw`.
- [ ] Seed `audio-cues.json` with first-pass cues:
  - `button-confirm`
  - `button-cancel`
  - `battle-start`
  - `battle-hit`
  - `battle-transition`
  - `pokemon-faint`
- [ ] Verify extracted catalog includes the expected cue names and file ids before rendering audio.

### Task 2: Decode, Trim, Normalize, And Convert

**Files:**

- Add: `scripts/poke-lounge/render-audio-cues.mjs`
- Add: `scripts/poke-lounge/convert-audio-cues.mjs`
- Modify: `package.json`

**Interfaces:**

- Input: `scripts/poke-lounge/audio-cues.json`
- Local intermediate output: `data/processed/poke-lounge-audio/wav/*.wav`
- Public output: `apps/web/public/assets/poke-lounge/audio/sfx/*.mp3`
- Public manifest: `apps/web/public/assets/poke-lounge/audio/audio-manifest.json`

- [ ] Select and install/prepare one local NDS SDAT/SSEQ decoder, preferably VGMTrans or an equivalent tool that can render selected sequence cues to WAV.
- [ ] Make `render-audio-cues.mjs` fail fast with a clear setup message if the decoder binary is unavailable.
- [ ] Render only the cue ids listed in `audio-cues.json`.
- [ ] Convert rendered WAV files with ffmpeg using mono MP3 output:

```bash
ffmpeg -y \
  -i input.wav \
  -af "atrim=start=0:duration=1.2,loudnorm=I=-18:LRA=11:TP=-1.5,afade=t=out:st=1.12:d=0.08" \
  -ac 1 \
  -ar 44100 \
  -codec:a libmp3lame \
  -b:a 64k \
  output.mp3
```

- [ ] Tune each cue's trim/duration/gain from `audio-cues.json`.
- [ ] Confirm every public MP3 is small enough for runtime preload:
  - UI SFX: target <= 50 KB each
  - Battle start/transition: target <= 150 KB each
  - First-pass total: target <= 500 KB
- [ ] Generate `audio-manifest.json` with id, src, durationMs, sizeBytes, and defaultVolume.

### Task 3: Browser Audio Runtime

**Files:**

- Add: `apps/web/src/components/poke-lounge/runtime/game/audio/poke-lounge-audio.ts`
- Add: `apps/web/src/components/poke-lounge/runtime/game/audio/poke-lounge-audio.types.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/battleAudio.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/gamePageStartup.ts`

**Interfaces:**

```ts
type PokeLoungeSfxId =
  | "button-confirm"
  | "button-cancel"
  | "battle-start"
  | "battle-hit"
  | "battle-transition"
  | "pokemon-faint";

primePokeLoungeAudio(): Promise<void>;
playPokeLoungeSfx(id: PokeLoungeSfxId, options?: { volume?: number }): void;
setPokeLoungeAudioMuted(muted: boolean): void;
```

- [ ] Fetch and cache `audio-manifest.json` once per page session.
- [ ] Prime audio on the first user gesture from the Poke Lounge page.
- [ ] Use Web Audio `AudioContext` for low-latency playback when available.
- [ ] Fall back to `HTMLAudioElement` if Web Audio initialization fails.
- [ ] Do not throw into gameplay code when audio assets fail to load.
- [ ] Keep any oscillator-based fallback dev-only or remove it once real assets are verified.
- [ ] Add a mute flag that can be reused by a future settings UI.

### Task 4: Gameplay Event Integration

**Files:**

- Modify: `apps/web/src/components/poke-lounge/runtime/game/input/mobileTouchControls.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/battleAudio.ts`

**Event Mapping:**

- `button-confirm`: A/confirm interaction and starter/room confirm
- `button-cancel`: B/cancel/back interaction
- `battle-transition`: wild encounter or battle scene transition start
- `battle-start`: battle scene entrance after transition
- `battle-hit`: HP decrease/pokemon hit animation trigger
- `pokemon-faint`: faint state transition

- [ ] Play confirm/cancel sounds only on intentional button actions, not every movement tick.
- [ ] Trigger battle transition and battle start sounds at distinct moments so they do not stack awkwardly.
- [ ] Trigger hit sound from the same side-specific HP decrease path used by the hit animation.
- [ ] Throttle repeated hit/faint sounds to avoid double playback from render resync.
- [ ] Keep multiplayer synchronization and battle state mutations unchanged.

### Task 5: Verification

**Files:**

- Add: `scripts/poke-lounge/verify-audio-assets.mjs`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`
- Modify: `package.json`

**Commands:**

```bash
pnpm poke-lounge:audio:extract
pnpm poke-lounge:audio:render
pnpm poke-lounge:audio:convert
pnpm poke-lounge:audio:verify
pnpm type:check:web
pnpm lint:web
pnpm build:web
pnpm e2e:smoke
```

- [ ] Verify manifest ids match `PokeLoungeSfxId`.
- [ ] Verify every manifest `src` returns 200 from the Next.js dev server.
- [ ] Verify every MP3 has nonzero duration, expected content type, and acceptable file size.
- [ ] Add Playwright coverage that primes audio through a real user gesture and confirms at least one SFX asset is requested.
- [ ] Run existing Poke Lounge E2E to ensure no gameplay regression.
- [ ] Manually verify desktop Chrome, mobile viewport WebKit, and production deployment after merge.

### Task 6: Merge And Deployment When Approved

**Files:**

- No additional files.

- [ ] Commit implementation branch with an AGENTS-compliant Korean commit message.
- [ ] Update local `main` from `origin/main` with `--ff-only`.
- [ ] Merge `main` back into the implementation branch and rerun verification.
- [ ] Squash merge into `main`.
- [ ] Push `main` only after user approval.
- [ ] Confirm Vercel deployment completes.
- [ ] Smoke test production Poke Lounge and verify audio asset requests from production URLs.
