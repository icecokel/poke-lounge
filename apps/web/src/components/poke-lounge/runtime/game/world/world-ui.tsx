"use client";
import { POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS } from "@poke-lounge/battle/timing";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { MobileWorldScreen } from "../../../mobile/mobile-game-shell";
import { getBattlePokemonAssets } from "../battle/battle-pokemon-assets";
import type { GameStateStore, PlayerPokemon } from "../state/game-state-store";
import {
  formatPokemonHp,
  formatRankScoreHud,
  getCurrentGameRankScore,
  formatRoundHudText,
  getPokemonExperienceProgress,
  getPokemonHpRatio,
} from "../scenes/world-scene-hud";
import { TournamentResultPanel } from "./tournament-result-panel";
import type { WorldUiSnapshot, WorldUiStore } from "./world-ui-store";
import {
  HealthBar,
  PixelPanel,
  PokemonSlot,
  StatusBadge,
} from "../../../ui/poke-lounge-ui-primitives";
import { TournamentBracketPanel } from "../tournament/tournament-bracket-panel";
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
  onResultLobby,
  onResultNewGame,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  competitiveRoundsEnabled: boolean;
  desktop: boolean;
  gameStateStore: GameStateStore;
  onResultLobby(): void;
  onResultNewGame(): void;
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
    <div
      className="absolute inset-0 z-[20000] font-[var(--pl-font-game)] text-[var(--pl-color-ink)] [image-rendering:auto]"
      data-poke-lounge-world-ui="true"
    >
      <WorldHud
        copy={copy}
        desktop={desktop}
        competitiveRoundsEnabled={competitiveRoundsEnabled}
        gameStateStore={gameStateStore}
        ui={ui}
        uiStore={uiStore}
      />
      <WorldNoticeLayer
        copy={copy}
        gameStateStore={gameStateStore}
        rawTournamentResult={rawUi.tournamentResult}
        onResultLobby={onResultLobby}
        onResultNewGame={onResultNewGame}
        ui={ui}
      />
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
    <div className="pointer-events-none absolute inset-0" data-poke-lounge-world-hud="true">
      {desktop ? (
        <>
          <RankScoreHud
            copy={copy}
            competitive={competitiveRoundsEnabled}
            stats={getCurrentGameRankScore(state)}
          />
        </>
      ) : null}
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
    <StatusBadge
      className="absolute top-16 right-3 text-right text-xs whitespace-pre-line"
      tone="blue"
    >
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
    }, POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS);
    return function callback() {
      return window.clearInterval(timer);
    };
  }, []);

  return (
    <StatusBadge
      className="absolute top-2.5 left-1/2 -translate-x-1/2 text-center text-xs whitespace-pre-line"
      tone="green"
    >
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
    <div
      className="pointer-events-auto absolute top-1/2 left-3 grid w-[clamp(150px,14vw,190px)] origin-left -translate-y-1/2 scale-[var(--poke-lounge-party-hud-scale,1)] grid-cols-[minmax(0,1fr)] gap-[7px]"
      data-poke-lounge-world-party-hud="true"
    >
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
      className="min-h-[51px] rounded-[7px_14px_7px_14px] border-[#4c747a] bg-[linear-gradient(#f8fdef_49%,#e0eddf_49%)] text-[clamp(10px,1.05vw,14px)] data-[active=true]:border-[#987638] data-[active=true]:bg-[linear-gradient(#fff4ce_49%,#e9ddb9_49%)]"
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
    <PixelPanel
      className="pointer-events-auto absolute top-1/2 left-28 grid min-h-[310px] w-[300px] -translate-y-1/2 gap-1.5 rounded-[10px] border-[length:var(--pl-panel-border)] border-[#4c747a] bg-[repeating-linear-gradient(0deg,#f7faeb_0_24px,#e9f0e1_24px_48px)] px-[18px] py-4 shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1] [&_p]:m-0 [&_h3]:m-0 [&_h3]:text-[11px] [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-[3px] [&_ul]:p-0 [&_li]:flex [&_li]:justify-between [&_li]:gap-2 [&_li]:text-[10px] [&_meter]:w-full [&>button:not([data-world-panel-close])]:min-h-7 [&>button:not([data-world-panel-close])]:rounded-[3px] [&>button:not([data-world-panel-close])]:border-2 [&>button:not([data-world-panel-close])]:border-[var(--pl-color-ink)] [&>button:not([data-world-panel-close])]:bg-[var(--pl-color-gold-soft)] [&>button:not([data-world-panel-close])]:font-black [&>button:not([data-world-panel-close])]:shadow-[0_2px_0_var(--pl-color-ink)] [&>button:disabled]:bg-[var(--pl-color-surface-muted)] [&>button:disabled]:shadow-none"
      data-poke-lounge-pokemon-status="true"
    >
      <button
        type="button"
        className="absolute top-2 right-2 border-0 bg-transparent text-xl text-[var(--pl-color-ink)]"
        data-world-panel-close="true"
        onClick={onClose}
        aria-label={copy.settingsClose}
      >
        ×
      </button>
      <div className="flex items-center gap-2 [&>div]:grid [&>div]:gap-[3px]">
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
      className="inline-block shrink-0 bg-no-repeat [image-rendering:pixelated]"
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
  onResultLobby,
  onResultNewGame,
  rawTournamentResult,
  ui,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  onResultLobby(): void;
  onResultNewGame(): void;
  rawTournamentResult: string | null;
  ui: WorldUiSnapshot;
}) {
  const gameState = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const tournamentProjection = gameState.tournament.serverProjection;

  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite">
      {ui.areaAnnouncement ? (
        <div className="absolute top-[78px] left-1/2 -translate-x-1/2 rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-center text-sm leading-[1.25] font-black whitespace-pre-line text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]">
          {ui.areaAnnouncement}
        </div>
      ) : null}
      {ui.nurseMessage ? (
        <div className="absolute bottom-[74px] left-1/2 -translate-x-1/2 rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-center text-sm leading-[1.25] font-black whitespace-pre-line text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]">
          {ui.nurseMessage}
        </div>
      ) : null}
      {ui.interactionPrompt ? (
        <div className="absolute bottom-11 left-1/2 -translate-x-1/2 text-center text-xs leading-[1.25] font-black whitespace-pre-line text-[#fff9dd] [text-shadow:-2px_-2px_#263238,2px_-2px_#263238,-2px_2px_#263238,2px_2px_#263238]">
          {ui.interactionPrompt}
        </div>
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
          className="pointer-events-none absolute top-2 left-1/2 z-[900] box-border w-[min(calc(100%-16px),720px)] -translate-x-1/2 rounded-[9px] border-[3px] border-[#506d7b] bg-[#293d48] px-3 py-2.5 text-center text-sm leading-[1.45] font-black whitespace-pre-line text-[var(--pl-color-surface-raised)] shadow-[inset_0_0_0_2px_#b0c1b3,0_4px_0_#20333c]"
          data-poke-lounge-tournament-announcement="true"
        >
          {ui.tournamentAnnouncement}
        </PixelPanel>
      ) : null}
      {ui.tournamentResult ? (
        <TournamentResultPanel
          copy={copy}
          locale={copy.locale}
          localizedText={ui.tournamentResult}
          rawText={rawTournamentResult}
          final={gameState.round.phase === "game-result"}
          onLobby={onResultLobby}
          onNewGame={onResultNewGame}
        />
      ) : null}
    </div>
  );
}

export function NurseHealingEffect() {
  return (
    <div
      className="absolute top-[40%] left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(183_216_151_/_75%),transparent_70%)] shadow-[0_0_32px_rgb(183_216_151_/_50%)] [&_i]:absolute [&_i]:size-2 [&_i]:rotate-45 [&_i]:bg-[#fff176] [&_i]:animate-[world-nurse-sparkle_1000ms_ease-out_forwards] [&_i:nth-child(2)]:left-6 [&_i:nth-child(2)]:bg-[#81d4fa] [&_i:nth-child(2)]:[animation-delay:60ms] [&_i:nth-child(3)]:left-12 [&_i:nth-child(3)]:bg-[#f8bbd0] [&_i:nth-child(3)]:[animation-delay:100ms] [&_i:nth-child(4)]:left-[70px] [&_i:nth-child(4)]:bg-[#c5e1a5] [&_i:nth-child(4)]:[animation-delay:140ms]"
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
    <div className="pointer-events-auto absolute inset-0 z-10 bg-[rgb(16_24_32_/_30%)]">
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
