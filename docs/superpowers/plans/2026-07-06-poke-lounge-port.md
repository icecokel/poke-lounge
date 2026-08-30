# Poke Lounge Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/Users/smlee/Documents/poke-lounge` into VSCoke as a playable locale-aware web game at `/:locale/game/poke-lounge`.

**Architecture:** Keep Poke Lounge as a browser-only Phaser island under the existing VSCoke Next app. Use a thin VSCoke route/client wrapper, copy the source-compatible runtime into a contained feature directory, and copy only the minimal static assets required for starter selection, room entry, world boot, and battle smoke. Leave backend ranking, ROM conversion, and full asset browsing out of the first port.

**Tech Stack:** VSCoke pnpm monorepo, `apps/web` Next 15 App Router, React 19, next-intl, Tailwind v4, Phaser 3.90, Playwright E2E.

---

## Team Analysis Summary

- Source analyst: Poke Lounge is a Next App Router single project. The playable game route is `src/app/game/page.tsx` -> `src/app/game/GameClient.tsx` -> dynamic import `src/game-page.ts` -> `src/game/gamePageStartup.ts`. Phaser boots through `src/game/createPokeLoungeGame.ts` with `BootScene`, `WorldScene`, and `BattleScene`.
- Target analyst: VSCoke game routes belong under `apps/web/src/app/[locale]/game/*`. Game-specific UI/code should live under `apps/web/src/components/poke-lounge/`. The Game Center, search index, explorer tree, sitemap, messages, and Playwright tests must be updated.
- Risk analyst: Direct copy is unsafe because VSCoke is a pnpm monorepo on Next 15 with next-intl and Tailwind v4, while Poke Lounge is a standalone Next 16/npm project with global CSS and Vitest/jsdom. First port should cover starter selection, room entry, world/battle boot smoke, and nothing more.

## Scope

### In Scope

- Route: `/:locale/game/poke-lounge`, implemented at `apps/web/src/app/[locale]/game/poke-lounge/page.tsx`.
- Feature code: `apps/web/src/components/poke-lounge/`.
- Runtime: source-compatible copy of Poke Lounge `src/game/**` plus the top-level modules required by the game route.
- Static assets: minimal allowlist copied into source-compatible public URLs under `apps/web/public/assets`, `apps/web/public/game-data`, and `apps/web/public/maps`.
- UI integration: Game Center card, search index, explorer tree, sitemap, locale messages.
- Verification: web typecheck, lint, knip, build, i18n integrity, and focused Playwright smoke.

### Out Of Scope For First Port

- Poke Lounge `/` ROM conversion page.
- Full `public` copy from the source project. Source `public` is about 171MB and 14,715 files.
- Raw ROM files and raw/processed extraction workspaces.
- Backend game result/ranking integration. Current API `GameType` only supports `SKY_DROP`.
- WebRTC production hardening and 4-6 player stress testing.
- Next 16 upgrade.
- Full Vitest/jsdom test migration.

## Intentional File Naming Exception

New VSCoke-owned files must use kebab-case. The copied Poke Lounge runtime keeps the source filenames for the first port, including files such as `createPokeLoungeGame.ts`, `BootScene.ts`, `WorldScene.ts`, and `BattleScene.ts`.

Reason: the source runtime has many relative imports across class-named files. Renaming them during the first port creates large mechanical churn unrelated to VSCoke integration and increases the chance of case-sensitive build failures on Linux. New wrapper, CSS, and E2E files remain kebab-case.

## File Map

### Create

- `apps/web/src/app/[locale]/game/poke-lounge/page.tsx`: locale route entry that dynamically loads the browser-only game wrapper.
- `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`: VSCoke client wrapper that starts and cleans up the Poke Lounge runtime.
- `apps/web/src/components/poke-lounge/poke-lounge.module.css`: scoped CSS module adapted from source `src/styles.css`.
- `apps/web/src/components/poke-lounge/runtime/game/**`: copied Poke Lounge game runtime, excluding source tests.
- `apps/web/src/components/poke-lounge/runtime/game-page.ts`: copied source route bootstrap.
- `apps/web/src/components/poke-lounge/runtime/bootstrap.ts`: copied source bootstrap data loader.
- `apps/web/src/components/poke-lounge/runtime/starter-selection.ts`: copied starter selection DOM renderer.
- `apps/web/src/components/poke-lounge/runtime/types.ts`: copied runtime data types.
- `apps/web/src/components/poke-lounge/runtime/runtimeEnvironment.ts`: copied browser/runtime helper.
- `apps/web/src/components/poke-lounge/runtime/rom-asset-browser.ts`: copied because `starter-selection.ts` imports it at module top level.
- `apps/web/src/components/poke-lounge/runtime/rom-web-conversion.ts`: copied because `starter-selection.ts` imports it at module top level.
- `apps/web/src/components/poke-lounge/runtime/ui-assets.ts`: copied because starter/ROM helper modules import it.
- `apps/web/src/components/poke-lounge/runtime/map-sample.ts`: copied because `rom-web-conversion.ts` imports it.
- `apps/web/tests/e2e/poke-lounge.spec.ts`: focused route/game smoke test.
- Static asset directories under `apps/web/public/assets`, `apps/web/public/game-data`, and `apps/web/public/maps`.

### Modify

- `.gitignore`: add ROM/raw extraction ignore rules before any asset copy.
- `apps/web/messages/ko-KR.json`: add `Game.pokeLoungeTitle` and `Game.pokeLoungeDesc`.
- `apps/web/messages/en-US.json`: add matching keys.
- `apps/web/messages/ja-JP.json`: add matching keys.
- `apps/web/src/app/[locale]/game/page.tsx`: add Game Center card and prefetch path.
- `apps/web/src/hooks/use-search-index.ts`: add search item.
- `apps/web/src/utils/get/explorer.ts`: expose route in explorer tree.
- `apps/web/src/app/sitemap.ts`: add localized sitemap route.
- `apps/web/tests/e2e/test-helpers.ts`: add Poke Lounge message keys to `AppMessages`.
- `apps/web/tests/e2e/hobby-games.spec.ts`: add Game Center card assertion only.

---

## Task 1: Raw Asset Guard

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Confirm branch and clean baseline**

Run from `/Users/smlee/vscoke/worktrees/feat/poke-lounge`:

```bash
git status --short --branch
```

Expected:

```text
## feature/poke-lounge
```

- [ ] **Step 2: Add ROM/raw extraction ignore rules**

Append this block to `.gitignore` after the existing `# misc` or asset-related section:

```gitignore

# Poke Lounge local ROM and extraction workspaces
*.nds
*.gba
*.gbc
*.gb
*.cia
*.3ds
data/raw/
data/processed/
assets/raw/
assets/processed/
apps/web/data/raw/
apps/web/data/processed/
apps/web/assets/raw/
apps/web/assets/processed/
apps/web/public/assets/raw/
apps/web/public/assets/processed/
```

- [ ] **Step 3: Verify ignore rules catch ROM/raw paths**

Run:

```bash
git check-ignore -v 'data/포켓몬스터 하트골드(K).nds'
git check-ignore -v 'apps/web/data/raw/sample.bin'
git check-ignore -v 'apps/web/assets/processed/sample.png'
```

Expected: each command prints a matching `.gitignore` rule and exits `0`.

- [ ] **Step 4: Check no ROM/archive files are already tracked**

Run:

```bash
git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true
```

Expected: no output.

- [ ] **Step 5: Commit guardrail**

```bash
git add .gitignore
git commit -m "chore(poke-lounge):ROM 제외 규칙 추가"
```

---

## Task 2: Focused E2E Contract

**Files:**

- Create: `apps/web/tests/e2e/poke-lounge.spec.ts`
- Modify: `apps/web/tests/e2e/test-helpers.ts`
- Modify: `apps/web/tests/e2e/hobby-games.spec.ts`

- [ ] **Step 1: Add message keys to E2E type**

In `apps/web/tests/e2e/test-helpers.ts`, extend the `Game` interface:

```ts
Game: {
  start: string;
  exit: string;
  apiUnavailable: string;
  leaderboardEmpty: string;
  loadFailed: string;
  notEnoughLetters: string;
  doomTitle: string;
  wordleTitle: string;
  pokeLoungeTitle: string;
  pokeLoungeDesc: string;
}
```

- [ ] **Step 2: Create focused Poke Lounge E2E spec**

Create `apps/web/tests/e2e/poke-lounge.spec.ts` with this content:

```ts
import { expect, test } from "@playwright/test";
import { escapeRegExp, gotoWithRetry, resolveLocaleAndMessages } from "./test-helpers";

test.describe("Poke Lounge", () => {
  test("게임 센터 카드와 직접 진입 플레이 흐름을 검증한다", async ({ page }) => {
    const browserErrors: string[] = [];

    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });

    const { locale, messages } = await resolveLocaleAndMessages(page);
    const localeRegex = escapeRegExp(locale);

    await gotoWithRetry(page, `/${locale}/game`);
    await expect(
      page.getByRole("button", {
        name: new RegExp(escapeRegExp(messages.Game.pokeLoungeTitle)),
      }),
    ).toBeVisible();

    await gotoWithRetry(page, `/${locale}/game/poke-lounge?scene=battle&e2eBattle=wild-victory`);
    await expect(page).toHaveURL(new RegExp(`/${localeRegex}/game/poke-lounge`));
    await expect(page.getByTestId("poke-lounge-page")).toBeVisible();
    await expect(page.getByTestId("poke-lounge-game-root")).toBeVisible();
    await expect(page.locator("[data-screen='starter-selection']")).toBeVisible({ timeout: 30000 });

    await page.locator("[data-starter-confirm]").click();
    await expect(page.locator("[data-room-entry-screen='true']")).toBeVisible({ timeout: 30000 });
    await page.locator("[data-room-entry-solo]").click();
    await expect(page.locator("#game-root canvas")).toBeVisible({ timeout: 30000 });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const pokeWindow = window as Window & {
              __POKE_LOUNGE_E2E__?: { getActiveSceneKey: () => string | null };
            };

            return pokeWindow.__POKE_LOUNGE_E2E__?.getActiveSceneKey() ?? null;
          }),
        { timeout: 30000 },
      )
      .toBe("battle");

    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.pokeLoungeE2eBattle ?? ""), {
        timeout: 30000,
      })
      .not.toBe("");

    expect(browserErrors.join("\n")).toBe("");
  });
});
```

- [ ] **Step 3: Add Game Center assertion to existing hobby spec**

In `apps/web/tests/e2e/hobby-games.spec.ts`, after the Wordle button assertion, add:

```ts
await expect(
  page.getByRole("button", {
    name: new RegExp(escapeRegExp(messages.Game.pokeLoungeTitle)),
  }),
).toBeVisible();
```

- [ ] **Step 4: Run the focused spec and confirm it fails for missing route/messages**

Run:

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
```

Expected before implementation: FAIL because `messages.Game.pokeLoungeTitle` and `/game/poke-lounge` do not exist yet.

---

## Task 3: Minimal Static Assets

**Files:**

- Create/modify: `apps/web/public/assets/**`
- Create/modify: `apps/web/public/game-data/**`
- Create/modify: `apps/web/public/maps/**`

- [ ] **Step 1: Confirm target public path has no source-compatible Poke Lounge directories yet**

Run:

```bash
find apps/web/public -maxdepth 2 -type d | sort
```

Expected current top-level public directories are `images` and `sounds`. If `assets`, `game-data`, or `maps` already exist, inspect them before copying and avoid overwriting unrelated files.

- [ ] **Step 2: Create destination directories**

2026-07-07 update: the original copy commands in this section were superseded
by the final curated asset layout. Do not create public legacy extraction
directories in VSCoke.

```bash
mkdir -p \
  apps/web/public/assets/pokemon \
  apps/web/public/assets/poke-lounge/dump/pbr_winframe.narc \
  apps/web/public/assets/poke-lounge/extraction \
  apps/web/public/assets/poke-lounge/player \
  apps/web/public/assets/poke-lounge/screens/pbr_b_plist_gra.narc \
  apps/web/public/assets/poke-lounge/textures/a_0_8_1_0133 \
  apps/web/public/assets/poke-lounge/textures/a_0_8_1_0132 \
  apps/web/public/assets/poke-lounge/textures/a_0_8_1_0039 \
  apps/web/public/assets/poke-lounge/textures/a_0_8_1_0184 \
  apps/web/public/assets/pokemmo-reference/tilesets \
  apps/web/public/game-data \
  apps/web/public/maps/pokemmo-reference
```

- [ ] **Step 3: Copy allowlisted game data and maps**

```bash
rsync -a /Users/smlee/Documents/poke-lounge/public/game-data/ apps/web/public/game-data/
install -m 0644 /Users/smlee/Documents/poke-lounge/public/maps/pokemmo-reference/town.json apps/web/public/maps/pokemmo-reference/town.json
```

- [ ] **Step 4: Copy allowlisted sprite and battle assets**

```bash
rsync -a /Users/smlee/Documents/poke-lounge/public/assets/pokemon/ apps/web/public/assets/pokemon/
install -m 0644 /Users/smlee/Documents/poke-lounge/public/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png apps/web/public/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png
# Copy the allowlisted derived JSON/PNG files into apps/web/public/assets/poke-lounge/**.
# Keep source-specific extraction directory names out of VSCoke public paths.
```

- [ ] **Step 5: Verify required files exist and size stays small**

```bash
test -f apps/web/public/game-data/bootstrap.json
test -f apps/web/public/game-data/battle-screen-assets.json
test -f apps/web/public/game-data/wild-encounter-tables.json
test -f apps/web/public/maps/pokemmo-reference/town.json
test -f apps/web/public/assets/pokemon/front/152.png
test -f apps/web/public/assets/pokemon/battle/155/front-default-normal.png
test -f apps/web/public/assets/poke-lounge/player/hero-atlas.json
test -f apps/web/public/assets/poke-lounge/player/hero-atlas.png
test -f apps/web/public/assets/poke-lounge/extraction/personal-data.json
test -f apps/web/public/assets/poke-lounge/extraction/growth-table.json
test -f apps/web/public/assets/poke-lounge/extraction/refined-battle-records.json
test -f apps/web/public/assets/poke-lounge/screens/pbr_b_plist_gra.narc/screen_0010_gfx_0022_pal_0023.png
test -f apps/web/public/assets/poke-lounge/dump/pbr_winframe.narc/file_0000_pal_0024.png
du -sh apps/web/public/assets apps/web/public/game-data apps/web/public/maps
```

Expected: copied Poke Lounge subset is only a few MB, not the full 171MB source `public`.

- [ ] **Step 6: Commit minimal assets**

```bash
git add apps/web/public/assets apps/web/public/game-data apps/web/public/maps
git commit -m "feat(poke-lounge):최소 게임 자산 추가"
```

---

## Task 4: Runtime Copy And Browser Wrapper

**Files:**

- Create: `apps/web/src/components/poke-lounge/runtime/**`
- Create: `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`
- Create: `apps/web/src/components/poke-lounge/poke-lounge.module.css`
- Create: `apps/web/src/app/[locale]/game/poke-lounge/page.tsx`

- [ ] **Step 1: Copy source runtime without tests**

```bash
mkdir -p apps/web/src/components/poke-lounge/runtime/game
rsync -a \
  --exclude='*.test.ts' \
  /Users/smlee/Documents/poke-lounge/src/game/ \
  apps/web/src/components/poke-lounge/runtime/game/
install -m 0644 /Users/smlee/Documents/poke-lounge/src/game-page.ts apps/web/src/components/poke-lounge/runtime/game-page.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/bootstrap.ts apps/web/src/components/poke-lounge/runtime/bootstrap.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/starter-selection.ts apps/web/src/components/poke-lounge/runtime/starter-selection.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/types.ts apps/web/src/components/poke-lounge/runtime/types.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/runtimeEnvironment.ts apps/web/src/components/poke-lounge/runtime/runtimeEnvironment.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/rom-asset-browser.ts apps/web/src/components/poke-lounge/runtime/rom-asset-browser.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/rom-web-conversion.ts apps/web/src/components/poke-lounge/runtime/rom-web-conversion.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/ui-assets.ts apps/web/src/components/poke-lounge/runtime/ui-assets.ts
install -m 0644 /Users/smlee/Documents/poke-lounge/src/map-sample.ts apps/web/src/components/poke-lounge/runtime/map-sample.ts
```

- [ ] **Step 2: Verify copied runtime excludes source tests**

```bash
find apps/web/src/components/poke-lounge/runtime -name '*.test.ts' -print
test -f apps/web/src/components/poke-lounge/runtime/game/battle/growthTable.json
```

Expected: first command prints no files. Second command exits `0`.

- [ ] **Step 3: Create scoped CSS module**

Create `apps/web/src/components/poke-lounge/poke-lounge.module.css` by adapting `/Users/smlee/Documents/poke-lounge/src/styles.css` with these rules:

```css
.page {
  --rom-screen-background: #4a4242;
  display: grid;
  min-height: 100vh;
  margin: 0;
  background: var(--rom-screen-background);
  color: #17201a;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  place-items: center;
}

.page,
.page * {
  box-sizing: border-box;
}

.page button {
  font: inherit;
}

.page:fullscreen {
  display: grid;
  width: 100vw;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  place-items: center;
}

.page:global(.is-game-fullscreen-fallback) {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  width: 100vw;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
  place-items: center;
}

:global(body.is-game-fullscreen-fallback-active) {
  overflow: hidden;
}

.page :global(#game-root) {
  position: relative;
  width: min(100vw, calc(100vh * 4 / 3), 1024px);
  aspect-ratio: 4 / 3;
  background: var(--rom-screen-background);
}

.page:fullscreen :global(#game-root),
.page:global(.is-game-fullscreen-fallback) :global(#game-root) {
  width: min(100vw, calc(100dvh * 4 / 3), 1024px);
  max-height: 100dvh;
}

.page :global(#game-root canvas) {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
```

Then continue porting the remaining source class/data selectors from `src/styles.css` below these scoped rules. Convert every plain global selector to a `.page :global(...)` selector, except `body.is-game-fullscreen-fallback-active`, which must remain a body-level global selector.

Examples:

```css
.page :global(.fullscreen-toggle-button) {
  position: absolute;
}

.page :global(.mobile-touch-controls) {
  position: absolute;
}

.page :global(.webrtc-signaling-panel) {
  position: absolute;
}

.page :global([data-rom-asset-role="contact-sheet"]) {
  display: grid;
}
```

Do not copy the source `:root`, `body`, `*`, `#app`, or unscoped `button` rules into global CSS.

- [ ] **Step 4: Create VSCoke client wrapper**

Create `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useGame } from "@/contexts/game-context";
import styles from "./poke-lounge.module.css";

type PokeLoungeWindow = Window & {
  __POKE_LOUNGE_GAME__?: { destroy: (removeCanvas?: boolean) => void };
  __POKE_LOUNGE_E2E__?: unknown;
};

export function PokeLoungeGame() {
  const { setGamePlaying } = useGame();

  useEffect(() => {
    let cancelled = false;
    setGamePlaying(true);

    void import("./runtime/game-page").then(({ startGamePageFromDocument }) => {
      if (!cancelled) {
        void startGamePageFromDocument(document, new URL(window.location.href));
      }
    });

    return () => {
      cancelled = true;
      setGamePlaying(false);

      const pokeWindow = window as PokeLoungeWindow;
      pokeWindow.__POKE_LOUNGE_GAME__?.destroy(true);
      delete pokeWindow.__POKE_LOUNGE_GAME__;
      delete pokeWindow.__POKE_LOUNGE_E2E__;
      delete document.documentElement.dataset.pokeLoungeE2eBattle;
      document.body.classList.remove("is-game-fullscreen-fallback-active");
      document.querySelector<HTMLElement>("#game-root")?.replaceChildren();
    };
  }, [setGamePlaying]);

  return (
    <main className={`${styles.page} phaser-game-page`} data-testid="poke-lounge-page">
      <div id="game-root" data-testid="poke-lounge-game-root" />
    </main>
  );
}
```

- [ ] **Step 5: Create browser-only route**

Create `apps/web/src/app/[locale]/game/poke-lounge/page.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

const PokeLoungeGame = dynamic(
  () => import("@/components/poke-lounge/poke-lounge-game").then(mod => mod.PokeLoungeGame),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-4 text-white">
        <p className="text-sm font-semibold tracking-wide">Loading Poke Lounge...</p>
      </main>
    ),
  },
);

export default function PokeLoungePage() {
  return <PokeLoungeGame />;
}
```

- [ ] **Step 6: Run typecheck and fix only concrete compile errors from the copied runtime**

```bash
pnpm type:check:web
```

Expected after fixes: exit `0`.

Common concrete fixes allowed in this task:

- If TypeScript reports an unused import copied from source, remove that exact import.
- If TypeScript reports a missing copied top-level module, copy the exact source module into `apps/web/src/components/poke-lounge/runtime/` and keep relative imports source-compatible.
- If TypeScript reports a DOM global type mismatch in `poke-lounge-game.tsx`, keep the `PokeLoungeWindow` local type and avoid editing global app types.

- [ ] **Step 7: Run lint on the wrapper/runtime**

```bash
pnpm lint:web
```

Expected after fixes: exit `0`.

- [ ] **Step 8: Commit runtime and wrapper**

```bash
git add apps/web/src/app/[locale]/game/poke-lounge apps/web/src/components/poke-lounge
git commit -m "feat(poke-lounge):게임 런타임 연결"
```

---

## Task 5: VSCoke Navigation And Locale Integration

**Files:**

- Modify: `apps/web/messages/ko-KR.json`
- Modify: `apps/web/messages/en-US.json`
- Modify: `apps/web/messages/ja-JP.json`
- Modify: `apps/web/src/app/[locale]/game/page.tsx`
- Modify: `apps/web/src/hooks/use-search-index.ts`
- Modify: `apps/web/src/utils/get/explorer.ts`
- Modify: `apps/web/src/app/sitemap.ts`

- [ ] **Step 1: Add matching locale messages**

Add these keys inside each file's `Game` object.

`apps/web/messages/ko-KR.json`:

```json
    "pokeLoungeTitle": "포케 라운지",
    "pokeLoungeDesc": "스타터를 고르고 라운지 월드와 브라우저 배틀을 탐색하는 포켓몬 팬 게임입니다.",
```

`apps/web/messages/en-US.json`:

```json
    "pokeLoungeTitle": "Poke Lounge",
    "pokeLoungeDesc": "Choose a starter and explore a lounge world with browser-based battles.",
```

`apps/web/messages/ja-JP.json`:

```json
    "pokeLoungeTitle": "ポケラウンジ",
    "pokeLoungeDesc": "スターターを選び、ラウンジの世界とブラウザバトルを探索するファンゲームです。",
```

- [ ] **Step 2: Add Game Center card**

In `apps/web/src/app/[locale]/game/page.tsx`, add this object to the `games` array after Fish Drift:

```ts
    {
      id: "poke-lounge",
      title: t("pokeLoungeTitle"),
      description: t("pokeLoungeDesc"),
      route: "/game/poke-lounge",
    },
```

Update the prefetch list:

```ts
["/game/sky-drop", "/game/fish-drift", "/game/poke-lounge", "/doom", "/game/wordle"].forEach(path =>
  prefetch(path),
);
```

- [ ] **Step 3: Add search index item**

In `apps/web/src/hooks/use-search-index.ts`, add this item between Fish Drift and Wordle:

```ts
      {
        id: "game:poke-lounge",
        type: "game",
        title: tGame("pokeLoungeTitle"),
        description: tGame("pokeLoungeDesc"),
        keywords: ["poke lounge", "pokemon", "phaser", "rpg"],
        path: "/game/poke-lounge",
        featured: true,
        priority: 392,
      },
```

- [ ] **Step 4: Add explorer tree item**

In `apps/web/src/utils/get/explorer.ts`, add this item under the `games` section:

```ts
        {
          icon: "react",
          id: "game-poke-lounge",
          label: "poke-lounge.tsx",
          path: "/game/poke-lounge",
        },
```

- [ ] **Step 5: Add sitemap route**

In `apps/web/src/app/sitemap.ts`, add the route to `staticRoutes` after Fish Drift:

```ts
    "/game/poke-lounge",
```

- [ ] **Step 6: Run i18n integrity smoke**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/i18n-integrity.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 7: Commit integration**

```bash
git add apps/web/messages apps/web/src/app/[locale]/game/page.tsx apps/web/src/hooks/use-search-index.ts apps/web/src/utils/get/explorer.ts apps/web/src/app/sitemap.ts apps/web/tests/e2e/test-helpers.ts apps/web/tests/e2e/hobby-games.spec.ts
git commit -m "feat(game):포케 라운지 진입점 추가"
```

---

## Task 6: Game Smoke Verification

**Files:**

- Verify: `apps/web/tests/e2e/poke-lounge.spec.ts`
- Verify: `apps/web/tests/e2e/hobby-games.spec.ts`

- [ ] **Step 1: Run focused Poke Lounge E2E**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
```

Expected: PASS. The test must see:

- Game Center card.
- Starter selection screen.
- Room entry screen.
- Phaser canvas.
- E2E scene key `battle`.
- Non-empty `document.documentElement.dataset.pokeLoungeE2eBattle`.
- No page errors or console errors.

- [ ] **Step 2: Run existing hobby games E2E**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/hobby-games.spec.ts --project=chromium
```

Expected: PASS. This confirms existing Sky Drop, Fish Drift, Doom, and Wordle route checks still work with the new card.

- [ ] **Step 3: Commit E2E if not already committed**

```bash
git add apps/web/tests/e2e/poke-lounge.spec.ts apps/web/tests/e2e/hobby-games.spec.ts apps/web/tests/e2e/test-helpers.ts
git commit -m "test(poke-lounge):브라우저 스모크 추가"
```

If those test changes were already included in Task 5's commit, skip this commit and record that in the implementation notes.

---

## Task 7: Full Web Verification And Cleanup

**Files:**

- Verify whole web app and changed files.

- [ ] **Step 1: Run typecheck**

```bash
pnpm type:check:web
```

Expected: exit `0`.

- [ ] **Step 2: Run lint**

```bash
pnpm lint:web
```

Expected: exit `0`.

- [ ] **Step 3: Run knip**

```bash
pnpm knip
```

Expected: exit `0`. If knip flags copied runtime exports as unused but they are used by dynamic import or Phaser scenes, add the narrowest `knip.json` ignore entry for the exact file/export and explain it in the commit body.

- [ ] **Step 4: Run web build**

```bash
pnpm build:web
```

Expected: exit `0`.

- [ ] **Step 5: Re-run focused E2E after production build sanity**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/i18n-integrity.spec.ts --project=chromium
```

Expected: both exit `0`.

- [ ] **Step 6: Confirm no forbidden source payloads entered git**

```bash
git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true
git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true
du -sh apps/web/public/assets apps/web/public/game-data apps/web/public/maps
```

Expected:

- First command prints no forbidden tracked paths.
- Second command prints no ROM/archive files.
- Size output stays near the minimal copied subset, not the 171MB source `public`.

- [ ] **Step 7: Record final status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: branch is `feature/poke-lounge`; status is clean after all commits.

---

## Follow-Up Plans After First Port

- Add a separate backend/API plan only if Poke Lounge needs ranking or shareable score results. That plan must update `apps/api`, generated Swagger types, `apps/web/src/services/score-service.ts`, and API tests.
- Add a separate ROM diagnostic plan if `/` conversion/browser UI is still wanted inside VSCoke. That work needs asset-size policy first because the full source `public` payload is too large for the first game port.
- Add a separate test migration plan for Vitest/jsdom source tests. Do not add `vitest` and `jsdom` to `apps/web` during the first playable port unless Playwright smoke cannot cover the risk.
