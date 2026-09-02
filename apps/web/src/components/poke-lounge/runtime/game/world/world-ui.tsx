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
import styles from "../../../poke-lounge.module.css";

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
  const ui = useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);

  return (
    <div className={styles.worldUiLayer} data-poke-lounge-world-ui="true">
      <WorldHud
        desktop={desktop}
        competitiveRoundsEnabled={competitiveRoundsEnabled}
        gameStateStore={gameStateStore}
        ui={ui}
        uiStore={uiStore}
      />
      <WorldNoticeLayer ui={ui} />
      {desktop ? <WorldSurfaceRouter copy={copy} ui={ui} uiStore={uiStore} /> : null}
    </div>
  );
}

export function WorldHud({
  desktop,
  competitiveRoundsEnabled,
  gameStateStore,
  ui,
  uiStore,
}: {
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
      <CurrencyHud value={player.wallet.pokeDollars} />
      <RankScoreHud competitive={competitiveRoundsEnabled} stats={player.competitive} />
      {competitiveRoundsEnabled ? <RoundHud gameStateStore={gameStateStore} /> : null}
      {desktop ? (
        <PartyHud
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

export function CurrencyHud({ value }: { value: number }) {
  return (
    <StatusBadge className={styles.worldCurrencyHud} tone="gold">
      {formatPokeDollars(value)}
    </StatusBadge>
  );
}

export function RankScoreHud({
  competitive,
  stats,
}: {
  competitive: boolean;
  stats: { rank: number | null; score: number };
}) {
  return (
    <StatusBadge className={styles.worldRankHud} tone="blue">
      {formatRankScoreHud(stats, competitive ? "competitive" : "solo")}
    </StatusBadge>
  );
}

export function RoundHud({ gameStateStore }: { gameStateStore: GameStateStore }) {
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
      {formatRoundHudText(state.round, now)}
    </StatusBadge>
  );
}

export function PartyHud({
  activePartySlotIndex,
  onSelect,
  party,
  selectedSlotIndex,
}: {
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
  onSelect,
  pokemon,
  selected,
  slotIndex,
}: {
  active: boolean;
  onSelect(slotIndex: number): void;
  pokemon: PlayerPokemon | null;
  selected: boolean;
  slotIndex: number;
}) {
  return (
    <PokemonSlot
      className={styles.worldPartyHudSlot}
      active={active}
      emptyLabel={`슬롯 ${slotIndex + 1}`}
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
      name={pokemon?.name}
      selected={selected}
      sprite={pokemon ? <PokemonSprite pokemon={pokemon} size={42} /> : undefined}
      status={pokemon && pokemon.status !== "normal" ? formatStatus(pokemon.status) : undefined}
      disabled={!pokemon}
      onClick={function handleClick() {
        return onSelect(slotIndex);
      }}
      aria-label={
        pokemon ? `${pokemon.name} Lv.${pokemon.level} 상세` : `빈 파티 슬롯 ${slotIndex + 1}`
      }
    />
  );
}

export function PokemonStatusPanel({
  activePartySlotIndex,
  onClose,
  onSetLead,
  pokemon,
  slotIndex,
}: {
  activePartySlotIndex: number;
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
      <button type="button" className={styles.worldPanelClose} onClick={onClose} aria-label="닫기">
        ×
      </button>
      <div className={styles.worldPokemonHeading}>
        <PokemonSprite pokemon={pokemon} size={48} />
        <div>
          <strong>{pokemon.name}</strong>
          <span>Lv.{pokemon.level}</span>
        </div>
      </div>
      <p>HP {formatPokemonHp(pokemon)}</p>
      <HealthBar value={getPokemonHpRatio(pokemon)} aria-label="HP" />
      <p>
        {experience.atMaxLevel ? "EXP MAX" : `EXP ${experience.current} / ${experience.required}`}
      </p>
      <meter min={0} max={1} value={experience.ratio} aria-label="경험치" />
      <p>상태 {formatStatus(pokemon.status)}</p>
      <h3>기술</h3>
      <ul>
        {(pokemon.moves ?? []).slice(0, 4).map(function mapItem(move) {
          return (
            <li key={move.id}>
              <span>{move.name}</span>
              <small>
                {move.pp} / {move.maxPp}
              </small>
            </li>
          );
        })}
      </ul>
      <button type="button" disabled={!canSetLead} onClick={onSetLead}>
        {isActive ? "현재 선두" : pokemon.status === "fainted" ? "선두 지정 불가" : "선두로 지정"}
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

export function WorldNoticeLayer({ ui }: { ui: WorldUiSnapshot }) {
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
      {ui.tournamentAnnouncement ? (
        <div
          className={styles.worldTournamentAnnouncement}
          data-poke-lounge-tournament-announcement="true"
        >
          {ui.tournamentAnnouncement}
        </div>
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

function formatStatus(status: PlayerPokemon["status"]): string {
  if (status === "fainted") return "전투불능";
  if (status === "poisoned") return "독";
  if (status === "burned") return "화상";
  if (status === "paralyzed") return "마비";
  return "정상";
}
