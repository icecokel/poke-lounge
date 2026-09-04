"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { MobileWorldScreen } from "../../../mobile/mobile-game-shell";
import { getBattlePokemonAssets } from "../battle/battle-pokemon-assets";
import type { GameStateStore, PlayerPokemon } from "../state/game-state-store";
import {
  formatPokemonHp,
  formatPokeDollars,
  formatRankScoreHud,
  formatRoundHudText,
  getPokemonExperienceProgress,
  getPokemonHpRatio,
} from "../scenes/world-scene-hud";
import type { WorldUiSnapshot, WorldUiStore } from "./world-ui-store";
import {
  HealthBar,
  PixelPanel,
  PokemonSlot,
  StatusBadge,
} from "../../../ui/poke-lounge-ui-primitives";
import { TournamentBracketPanel } from "../tournament/tournament-bracket-panel";
import styles from "../../../poke-lounge.module.css";
import {
  localizeMobileWorldUiState,
  localizeMoveName,
  localizePokemonName,
  localizeRuntimeText,
} from "../i18n/runtime-game-localization";

export function WorldUiLayer({
  copy,
  competitiveRoundsEnabled,
  desktop,
  gameStateStore,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  competitiveRoundsEnabled: boolean;
  desktop: boolean;
  gameStateStore: GameStateStore;
  uiStore: WorldUiStore;
}) {
  const rawUi = useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);
  const ui: WorldUiSnapshot = {
    ...rawUi,
    areaAnnouncement: rawUi.areaAnnouncement
      ? localizeRuntimeText(rawUi.areaAnnouncement, copy.locale)
      : null,
    interactionPrompt: rawUi.interactionPrompt
      ? localizeRuntimeText(rawUi.interactionPrompt, copy.locale)
      : null,
    mobile: rawUi.mobile ? localizeMobileWorldUiState(rawUi.mobile, copy.locale) : null,
    nurseMessage: rawUi.nurseMessage ? localizeRuntimeText(rawUi.nurseMessage, copy.locale) : null,
    tournamentAnnouncement: rawUi.tournamentAnnouncement
      ? localizeRuntimeText(rawUi.tournamentAnnouncement, copy.locale)
      : null,
    tournamentResult: rawUi.tournamentResult
      ? localizeRuntimeText(rawUi.tournamentResult, copy.locale)
      : null,
  };

  return (
    <div className={styles.worldUiLayer} data-poke-lounge-world-ui="true">
      <WorldHud
        copy={copy}
        desktop={desktop}
        competitiveRoundsEnabled={competitiveRoundsEnabled}
        gameStateStore={gameStateStore}
        ui={ui}
        uiStore={uiStore}
      />
      <WorldNoticeLayer copy={copy} gameStateStore={gameStateStore} ui={ui} />
      {desktop ? <WorldSurfaceRouter copy={copy} ui={ui} uiStore={uiStore} /> : null}
    </div>
  );
}

export function WorldHud({
  copy,
  desktop,
  competitiveRoundsEnabled,
  gameStateStore,
  ui,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  desktop: boolean;
  competitiveRoundsEnabled: boolean;
  gameStateStore: GameStateStore;
  ui: WorldUiSnapshot;
  uiStore: WorldUiStore;
}) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const player = state.playersById[state.currentPlayerId];

  if (!player) return null;

  return (
    <div className={styles.worldHud} data-poke-lounge-world-hud="true">
      <CurrencyHud copy={copy} value={player.wallet.pokeDollars} />
      <RankScoreHud copy={copy} competitive={competitiveRoundsEnabled} stats={player.competitive} />
      {competitiveRoundsEnabled ? <RoundHud copy={copy} gameStateStore={gameStateStore} /> : null}
      {desktop ? (
        <PartyHud
          copy={copy}
          activePartySlotIndex={player.activePartySlotIndex}
          party={player.party}
          selectedSlotIndex={ui.pokemonStatusSlotIndex}
          onSelect={function handleSelect(slotIndex) {
            return uiStore.dispatch({ type: "open-pokemon-status", slotIndex });
          }}
        />
      ) : null}
      {desktop && ui.pokemonStatusSlotIndex !== null ? (
        <PokemonStatusPanel
          copy={copy}
          activePartySlotIndex={player.activePartySlotIndex}
          pokemon={
            player.party.find(function findItem(slot) {
              return slot.slotIndex === ui.pokemonStatusSlotIndex;
            })?.pokemon ?? null
          }
          slotIndex={ui.pokemonStatusSlotIndex}
          onClose={function handleClose() {
            return uiStore.dispatch({ type: "close-pokemon-status" });
          }}
          onSetLead={function handleSetLead() {
            return uiStore.dispatch({
              type: "set-pokemon-status-lead",
              slotIndex: ui.pokemonStatusSlotIndex!,
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function CurrencyHud({ copy, value }: { copy: PokeLoungeCopy; value: number }) {
  return (
    <StatusBadge className={styles.worldCurrencyHud} tone="gold">
      {formatPokeDollars(value, copy.locale)}
    </StatusBadge>
  );
}

export function RankScoreHud({
  copy,
  competitive,
  stats,
}: {
  copy: PokeLoungeCopy;
  competitive: boolean;
  stats: { rank: number | null; score: number };
}) {
  return (
    <StatusBadge className={styles.worldRankHud} tone="blue">
      {localizeRuntimeText(
        formatRankScoreHud(stats, competitive ? "competitive" : "solo", copy.locale),
        copy.locale,
      )}
    </StatusBadge>
  );
}

export function RoundHud({
  copy,
  gameStateStore,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
}) {
  const [now, setNow] = useState(function callback() {
    return Date.now();
  });
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );

  useEffect(function runEffect() {
    const timer = window.setInterval(function handleInterval() {
      return setNow(Date.now());
    }, 250);
    return function callback() {
      return window.clearInterval(timer);
    };
  }, []);

  return (
    <StatusBadge className={styles.worldRoundHud} tone="green">
      {localizeRuntimeText(formatRoundHudText(state.round, now), copy.locale)}
    </StatusBadge>
  );
}

export function PartyHud({
  copy,
  activePartySlotIndex,
  onSelect,
  party,
  selectedSlotIndex,
}: {
  copy: PokeLoungeCopy;
  activePartySlotIndex: number;
  onSelect(slotIndex: number): void;
  party: ReturnType<GameStateStore["getCurrentLocalPlayer"]>["party"];
  selectedSlotIndex: number | null;
}) {
  return (
    <div className={styles.worldPartyHud} data-poke-lounge-world-party-hud="true">
      {Array.from({ length: 6 }, function callback(_, slotIndex) {
        const pokemon =
          party.find(function findItem(slot) {
            return slot.slotIndex === slotIndex;
          })?.pokemon ?? null;
        return (
          <PartyHudSlot
            key={slotIndex}
            copy={copy}
            active={slotIndex === activePartySlotIndex}
            pokemon={pokemon}
            selected={slotIndex === selectedSlotIndex}
            slotIndex={slotIndex}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

export function PartyHudSlot({
  active,
  copy,
  onSelect,
  pokemon,
  selected,
  slotIndex,
}: {
  active: boolean;
  copy: PokeLoungeCopy;
  onSelect(slotIndex: number): void;
  pokemon: PlayerPokemon | null;
  selected: boolean;
  slotIndex: number;
}) {
  return (
    <PokemonSlot
      className={styles.worldPartyHudSlot}
      active={active}
      emptyLabel={copy.partySlotLabel(slotIndex + 1)}
      hp={
        pokemon
          ? {
              current: pokemon.currentHp ?? null,
              max: pokemon.maxHp ?? null,
              ratio: getPokemonHpRatio(pokemon),
            }
          : undefined
      }
      level={pokemon?.level}
      name={pokemon ? localizePokemonName(pokemon.name, copy.locale) : undefined}
      selected={selected}
      sprite={pokemon ? <PokemonSprite pokemon={pokemon} size={42} /> : undefined}
      status={
        pokemon?.status && pokemon.status !== "normal"
          ? copy.game.statusLabel[pokemon.status]
          : undefined
      }
      disabled={!pokemon}
      onClick={function handleClick() {
        return onSelect(slotIndex);
      }}
      aria-label={
        pokemon
          ? copy.game.pokemonDetails(localizePokemonName(pokemon.name, copy.locale), pokemon.level)
          : copy.game.emptyPartySlot(slotIndex + 1)
      }
    />
  );
}

export function PokemonStatusPanel({
  activePartySlotIndex,
  copy,
  onClose,
  onSetLead,
  pokemon,
  slotIndex,
}: {
  activePartySlotIndex: number;
  copy: PokeLoungeCopy;
  onClose(): void;
  onSetLead(): void;
  pokemon: PlayerPokemon | null;
  slotIndex: number;
}) {
  if (!pokemon) return null;
  const experience = getPokemonExperienceProgress(pokemon);
  const isActive = activePartySlotIndex === slotIndex;
  const canSetLead = !isActive && pokemon.status !== "fainted";

  return (
    <PixelPanel className={styles.worldPokemonPanel} data-poke-lounge-pokemon-status="true">
      <button
        type="button"
        className={styles.worldPanelClose}
        onClick={onClose}
        aria-label={copy.settingsClose}
      >
        ×
      </button>
      <div className={styles.worldPokemonHeading}>
        <PokemonSprite pokemon={pokemon} size={48} />
        <div>
          <strong>{localizePokemonName(pokemon.name, copy.locale)}</strong>
          <span>Lv.{pokemon.level}</span>
        </div>
      </div>
      <p>HP {formatPokemonHp(pokemon)}</p>
      <HealthBar value={getPokemonHpRatio(pokemon)} aria-label="HP" />
      <p>
        {experience.atMaxLevel ? "EXP MAX" : `EXP ${experience.current} / ${experience.required}`}
      </p>
      <meter min={0} max={1} value={experience.ratio} aria-label={copy.game.experience} />
      <p>
        {copy.game.status} {copy.game.statusLabel[pokemon.status ?? "normal"]}
      </p>
      <h3>{copy.game.moves}</h3>
      <ul>
        {(pokemon.moves ?? []).slice(0, 4).map(function mapItem(move) {
          return (
            <li key={move.id}>
              <span>{localizeMoveName(move.name, copy.locale)}</span>
              <small>
                {move.pp} / {move.maxPp}
              </small>
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={!canSetLead} onClick={onSetLead}>
        {isActive
          ? copy.game.currentLead
          : pokemon.status === "fainted"
            ? copy.game.leadUnavailable
            : copy.mobile.setLead}
      </button>
    </PixelPanel>
  );
}

export function PokemonSprite({ pokemon, size }: { pokemon: PlayerPokemon; size: number }) {
  const sprite = getBattlePokemonAssets(pokemon.speciesId).front;
  const column = sprite.frame % 16;
  const row = Math.floor(sprite.frame / 16);

  return (
    <span
      aria-hidden="true"
      className={styles.worldPokemonSprite}
      style={{
        backgroundImage: `url(${sprite.path})`,
        backgroundPosition: `${-column * size}px ${-row * size}px`,
        backgroundSize: `${size * 16}px ${size * 16}px`,
        height: size,
        width: size,
      }}
    />
  );
}

export function WorldNoticeLayer({
  copy,
  gameStateStore,
  ui,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  ui: WorldUiSnapshot;
}) {
  const gameState = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const tournamentProjection = gameState.tournament.serverProjection;

  return (
    <div className={styles.worldNoticeLayer} aria-live="polite">
      {ui.areaAnnouncement ? (
        <div className={styles.worldAreaAnnouncement}>{ui.areaAnnouncement}</div>
      ) : null}
      {ui.nurseMessage ? <div className={styles.worldNurseMessage}>{ui.nurseMessage}</div> : null}
      {ui.interactionPrompt ? (
        <div className={styles.worldInteractionPrompt}>{ui.interactionPrompt}</div>
      ) : null}
      {ui.nurseHealing.active ? <NurseHealingEffect key={ui.nurseHealing.effectCount} /> : null}
      {ui.tournamentAnnouncement && tournamentProjection ? (
        <TournamentBracketPanel
          copy={copy}
          projection={tournamentProjection}
          text={ui.tournamentAnnouncement}
        />
      ) : ui.tournamentAnnouncement ? (
        <PixelPanel
          className={styles.worldTournamentAnnouncement}
          data-poke-lounge-tournament-announcement="true"
        >
          {ui.tournamentAnnouncement}
        </PixelPanel>
      ) : null}
      {ui.tournamentResult ? (
        <div className={styles.worldTournamentResult}>{ui.tournamentResult}</div>
      ) : null}
    </div>
  );
}

export function NurseHealingEffect() {
  return (
    <div
      className={styles.worldNurseEffect}
      data-poke-lounge-nurse-effect="true"
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export function WorldSurfaceRouter({
  copy,
  ui,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  ui: WorldUiSnapshot;
  uiStore: WorldUiStore;
}) {
  if (!ui.mobile || ui.mobile.screen === "explore") return null;

  return (
    <div className={styles.worldSurfaceScrim}>
      <MobileWorldScreen
        copy={copy}
        onAction={function handleAction(action) {
          return uiStore.dispatch(action);
        }}
        state={ui.mobile}
        variant="desktop"
      />
    </div>
  );
}
