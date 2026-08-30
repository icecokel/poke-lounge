# Poke Lounge Polish Plan

## Goal

Apply the approved Poke Lounge improvements:

- Animate HP decreases in battle.
- Show starter selection only after the player chooses solo or multiplayer.
- Move the mobile portrait play area upward and reserve more room for controls.
- Add reliable touch button press animation on mobile controls.
- Add a short battle scene entrance animation.

## Scope

- `apps/web/src/components/poke-lounge/runtime/game/gamePageStartup.ts`
- `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- `apps/web/src/components/poke-lounge/runtime/game/input/mobileTouchControls.ts`
- `apps/web/src/components/poke-lounge/poke-lounge.module.css`
- Poke Lounge E2E tests under `apps/web/tests/e2e`

## Implementation Steps

1. Update E2E contracts for the new room-first starter flow and mobile/battle animation probes.
2. Change startup orchestration so room selection happens before starter selection when no direct room URL is present.
3. Add display-only HP tween state in `BattleScene`, keeping battle state mutations unchanged.
4. Add battle entrance state to `BattleScene`, render a short reveal overlay, and suppress input until complete.
5. Add pointer-driven pressed state in mobile controls and CSS animation for touch feedback.
6. Adjust portrait mobile layout so the game root sits near the top and controls have reserved vertical space.
7. Run focused E2E, typecheck, lint, build, and mobile Playwright visual verification before merging.

## Verification

- `pnpm type:check:web`
- `pnpm lint:web`
- `pnpm build:web`
- Focused Poke Lounge Playwright tests
- Mobile viewport screenshot/DOM metric check for the attached-screen scenario
