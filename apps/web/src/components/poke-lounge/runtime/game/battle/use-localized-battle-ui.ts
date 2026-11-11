"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  localizeBattlePresentationState,
  localizeMobileBattleUiState,
} from "../i18n/runtime-game-localization";
import type { MobileBattleUiState } from "../ui/mobile-battle-ui";
import type { BattlePresentationState, BattleUiStore } from "./battle-ui-store";

const subscribeToNothing = () => () => {};
const emptySnapshot = () => null;

/**
 * Subscribes to the battle UI store and localises its snapshot.
 *
 * The scene publishes a new presentation object on every animation frame, so the expensive text
 * localisation is keyed on the strings it actually reads; `controls` keeps its reference across
 * presentation-only publishes and is localised once per change.
 */
export function useLocalizedBattleUi(
  uiStore: BattleUiStore | undefined,
  locale: string,
): { controls: MobileBattleUiState | null; presentation: BattlePresentationState | null } {
  const snapshot = useSyncExternalStore(
    uiStore?.subscribe ?? subscribeToNothing,
    uiStore?.getSnapshot ?? emptySnapshot,
    uiStore?.getSnapshot ?? emptySnapshot,
  );
  const rawControls = snapshot?.controls ?? null;
  const rawPresentation = snapshot?.presentation ?? null;
  const controls = useMemo(
    () => (rawControls ? localizeMobileBattleUiState(rawControls, locale) : null),
    [rawControls, locale],
  );

  const message = rawPresentation?.message ?? null;
  const playerDisplayName = rawPresentation?.player.displayName;
  const playerName = rawPresentation?.player.name;
  const opponentDisplayName = rawPresentation?.opponent.displayName;
  const opponentName = rawPresentation?.opponent.name;
  const text = useMemo(() => {
    if (
      playerDisplayName === undefined ||
      playerName === undefined ||
      opponentDisplayName === undefined ||
      opponentName === undefined
    )
      return null;
    // Only the fields below are read by localizeBattlePresentationState.
    const localized = localizeBattlePresentationState(
      {
        message,
        player: { displayName: playerDisplayName, name: playerName },
        opponent: { displayName: opponentDisplayName, name: opponentName },
      } as BattlePresentationState,
      locale,
    );
    return {
      message: localized.message,
      playerDisplayName: localized.player.displayName,
      playerName: localized.player.name,
      opponentDisplayName: localized.opponent.displayName,
      opponentName: localized.opponent.name,
    };
  }, [locale, message, playerDisplayName, playerName, opponentDisplayName, opponentName]);
  const presentation = useMemo(
    () =>
      rawPresentation && text
        ? {
            ...rawPresentation,
            message: text.message,
            player: {
              ...rawPresentation.player,
              displayName: text.playerDisplayName,
              name: text.playerName,
            },
            opponent: {
              ...rawPresentation.opponent,
              displayName: text.opponentDisplayName,
              name: text.opponentName,
            },
          }
        : null,
    [rawPresentation, text],
  );

  return { controls, presentation };
}
