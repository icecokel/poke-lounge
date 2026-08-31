---
name: poke-lounge-agent-browser-test
description: Run or coordinate agent-operated Poke Lounge browser playtests with Vercel agent-browser. Use whenever an agent is asked to play, test, diagnose, capture, or complete a Poke Lounge browser cycle in local, integration, or production environments. Do not use for unit or API-only tests that never operate a browser.
---

# Poke Lounge Agent Browser Test

Use Vercel Labs `agent-browser` as the default browser driver for agent-operated Poke Lounge tests.
Keep existing Playwright specs and their official runner for scripted regression; do not translate or replace
them unless the user asks.

## Before browser work

1. Read `docs/poke-lounge-multiplayer-test-scenarios.md` completely. It is the acceptance-test source of
   truth. Treat Playwright-specific implementation notes as scripted-suite guidance while preserving their
   observable acceptance criteria.
2. Run `agent-browser --version` and `agent-browser skills get core --full` before the first browser command.
3. If the CLI or its Chrome installation is unavailable, report `INFRA-BLOCKED`; do not silently substitute
   the Codex browser, the user's Chrome profile, or Playwright for an agent-operated playtest.

## Browser policy

- Run headless by default. Use `--headed` only when the user requests it or when a captured failure cannot be
  diagnosed headlessly.
- Give every player a unique named session such as `poke-<run-id>-mp1`. Never use the shared default session,
  reuse another player's session, or use `close --all`.
- Use headless Chromium for both environments. Assign Desktop Web `1440x900` or Mobile Web `390x844` from the
  recorded random seed. Apply Desktop with `set viewport 1440 900`. For Mobile, launch the blank named session
  with `open --init-script .agents/skills/poke-lounge-agent-browser-test/scripts/mobile-touch-init.js`, apply
  `set device "iPhone 12"`, then open the target URL. Verify viewport `390x844` and
  `navigator.maxTouchPoints > 0` before room entry. Firefox is excluded. A narrow viewport without the reviewed
  touch init script is not Mobile Web and must not report `ENV-READY`.
- The public entry screen and waiting lobby do not expose settings. Immediately after the host starts and the lobby
  closes, close any shortcut or mobile guide through its canonical control, open settings, and turn sound off before
  movement or battle input. Report `AUDIO-MUTED <MP role>` only after verifying that session's control state.
- The orchestrator does not occupy a player session unless the user explicitly asks it to play. One runner may
  own multiple named sessions when the requested player count exceeds the available agent concurrency.

## Execution

1. Use the snapshot-and-ref loop and take a fresh `snapshot -i` after navigation, scene changes, dialogs, or
   dynamic rerenders. Prefer roles and accessible names over CSS selectors.
2. Wait on visible UI, URL, network, or server-authoritative state. Do not use arbitrary fixed sleeps in place
   of readiness, room revision, round, match, phase, or turn conditions.
3. Drive every player through the public UI. Do not call internal APIs to force readiness, combat actions,
   results, rankings, or a winner.
   The entry screen defaults to Solo, so select the Multiplayer tab before entering the nickname and temporary
   password. Use a separate named session for each identity because same-profile tabs share localStorage identity.
4. Store screenshots and diagnostic artifacts under `output/agent-browser/poke-lounge/<run-id>/`; include the
   MP role, environment, checkpoint, and timestamp in filenames. Never record raw passwords, session IDs,
   cookies, tokens, the internal room code, or full Socket payloads.
5. Inspect `console`, `errors`, and relevant `network requests` at failures and before the final verdict. A
   one-cycle test ends only after the server-confirmed winner and rankings converge across every player, each
   player leaves through the UI, and the room reaches the documented cleanup state. Do not add an overall test
   timeout that shortens product deadlines.
6. Read only the documented room-field whitelist from the read-only E2E snapshot or another pre-redacted view.
   Do not print a full request/response body, issue `fetch`, replay a request, or route/mock it. If a safe whitelist
   view is unavailable, report `DOC-GAP` instead of collecting raw data. If the latest projection is missing,
   reload the UI once within the 60-second reconnect grace and inspect the page's automatic room GET.
   When a visible, enabled result control still requires canonical confirmation, do not reload: capture and confirm
   it exactly once, wait for the stable post-transition scene, and only then use the one allowed reload if evidence
   is still missing. Report only the documented field whitelist; never save the full response or sensitive identity
   values.
7. During the shared-world checkpoint, never send a direction input while a shortcut or mobile guide is open. Close
   the guide through its canonical control, verify the help is gone, and only then send the designated movement once.
   For Desktop, focus the `Poke Lounge 게임 화면` game surface and run
   `node .agents/skills/poke-lounge-agent-browser-test/scripts/desktop-arrow-hold.mjs <session> <Arrow>` once. The
   helper uses the official `agent-browser` stream input to hold and release a physical arrow for 50ms. Do not use
   CLI `keydown` for arrows in `agent-browser` 0.34.0 because it emits no physical key code, and do not use the
   zero-hold `press` command for movement. On Mobile, pointer-down the chosen direction, verify active direction
   and coordinate change, then pointer-up; do not assert a fixed hold duration. Retry movement once only when no
   coordinate or direction change is observed.
8. After each battle UI procedure, watch up to five seconds for its `session-actions` request. If no request appears,
   capture the current phase and focus, then repeat the complete UI procedure exactly once; do not wait passively for
   the turn deadline. If the retry also emits no request, report `CODE-FAIL`. After any 2xx, never retry that turn.
   For Desktop battle input, take a fresh interactive snapshot, focus the current
   `Poke Lounge 게임 화면` ref, verify the `싸운다` command, and then `press Enter`. Do not click the game surface merely to focus it because
   the pointer event also confirms the current option. After `command` rerenders to `move-select`, take another fresh
   snapshot and reacquire/focus the canvas ref before the move Enter. Do not capture screenshots or wait for another
   manager message between `ACTION-GO` and the first input.
9. On `DOC-GAP`, `CODE-FAIL`, `TEST-RUNNER`, or `INFRA-BLOCKED`, preserve safe evidence and report the
   classification. Resume only from a documented safe checkpoint; never fabricate progress.
10. Activate each in-game leave control once. A normal flow emits one POST; the client may retry once after a
    revision conflict or network failure, but the runner must not click leave again. Require the final 2xx and
    documented room cleanup state.

Close only the named sessions created by the run after in-game cleanup is complete. Report environment
assignments, checkpoints, winner and rankings, captured evidence, and defects as one final result. Include
connection recovery only when that scenario was actually exercised.
