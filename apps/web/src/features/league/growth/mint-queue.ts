import type { GameStateStore, PlayerPokemon } from "@/features/poke-lounge/contracts/game-state";
import type { PokeLoungeRuntimeAssets } from "@/components/poke-lounge/runtime/game/assets/poke-lounge-runtime-assets";
import {
  createStoredBattlePokemon,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "@poke-lounge/battle/adventure/battle/wild-battle-factory";
import { getPokemonIdentityKey } from "@/features/poke-lounge/domain/player/player-helpers";
import { getIndividualValueKey } from "@poke-lounge/battle/adventure/battle/individual-values";
import { evolvedGen4Ability } from "@poke-lounge/battle/gen4/traits";
import { LeagueApiError } from "../api/core";
import { mintLeagueCapture } from "../api/growth";
import type { LeagueSaveStorage } from "./league-save";

export function startLeagueMintQueue(
  store: GameStateStore,
  storage: LeagueSaveStorage,
  assets: PokeLoungeRuntimeAssets,
  onRunClosed: () => void,
) {
  let stopped = false;
  let busy = false;
  let changing = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function observe() {
    if (stopped || changing) return;
    const player = store.getCurrentLocalPlayer();
    const league = storage.getEnvelope().league;
    const newcomers = [
      ...player.party.flatMap(s => (s.pokemon ? [s.pokemon] : [])),
      ...player.pokemonBox,
    ].filter(p => {
      const key = getPokemonIdentityKey(p);
      return (
        key &&
        !league.monIds[key] &&
        !league.pendingMints.some(m => m.localKey === key) &&
        !league.rejectedMints.includes(key)
      );
    });
    changing = true;
    if (newcomers.length)
      storage.updateLeague(l => {
        for (const p of newcomers)
          l.pendingMints.push({
            localKey: getPokemonIdentityKey(p)!,
            speciesId: p.speciesId,
            level: p.level,
            requestKey: crypto.randomUUID(),
            createdAtMs: Date.now(),
          });
      });
    if (player.inventory.pokeball !== 99)
      store.upsertLocalPlayer({ ...player, inventory: { pokeball: 99 } });
    changing = false;
    if (!busy && !timer && retry <= 5) void process();
  }
  async function process() {
    const pending = storage.getEnvelope().league.pendingMints[0];
    if (stopped || busy || !pending) return;
    busy = true;
    try {
      const mon = await mintLeagueCapture(
        storage.getEnvelope().runId,
        pending.speciesId,
        pending.level,
        pending.requestKey,
      );
      if (stopped) return;
      changing = true;
      const player = store.getCurrentLocalPlayer();
      const replace = (pokemon: PlayerPokemon): PlayerPokemon => {
        if (getPokemonIdentityKey(pokemon) !== pending.localKey) return pokemon;
        const next = createStoredBattlePokemon({
          pokemon: {
            ...pokemon,
            ...mon,
            speciesId: pokemon.speciesId,
            level: pokemon.level,
            abilityId: evolvedGen4Ability(mon.speciesId, pokemon.speciesId, mon.abilityId),
            currentHp: undefined,
          },
          personalRecords: assets.json.get("romPersonalData") as RomPersonalRecordCollection,
          moveRecords: assets.json.get("romRefinedBattleRecords") as RomRefinedMoveCollection,
        });
        const hp = pokemon.currentHp ?? pokemon.maxHp ?? next.maxHp;
        const oldMax = pokemon.maxHp ?? next.maxHp;
        const currentHp =
          hp <= 0
            ? 0
            : Math.max(
                1,
                Math.min(next.maxHp, Math.round((hp * next.maxHp) / Math.max(1, oldMax))),
              );
        return {
          ...pokemon,
          ...mon,
          speciesId: pokemon.speciesId,
          level: pokemon.level,
          abilityId: next.abilityId,
          maxHp: next.maxHp,
          currentHp,
          attack: next.attack,
          defense: next.defense,
          speed: next.speed,
        };
      };
      const party = player.party.map(s => ({
        ...s,
        pokemon: s.pokemon ? replace(s.pokemon) : null,
      }));
      const pokemonBox = player.pokemonBox.map(replace);
      const newKey = getIndividualValueKey(mon.individualValues);
      storage.updateLeague(l => {
        l.monIds[newKey] = mon.monId;
        l.pendingMints = l.pendingMints.filter(m => m.requestKey !== pending.requestKey);
      });
      store.upsertLocalPlayer({
        ...player,
        party,
        pokemonBox,
        deferredMoveLearnings: player.deferredMoveLearnings?.map(l =>
          l.pokemonKey === pending.localKey ? { ...l, pokemonKey: newKey } : l,
        ),
      });
      changing = false;
      retry = 0;
    } catch (error) {
      if (stopped) return;
      if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE") {
        stopped = true;
        onRunClosed();
        return;
      }
      if (error instanceof LeagueApiError && error.code === "LEAGUE_MINT_REJECTED") {
        storage.updateLeague(l => {
          l.rejectedMints.push(pending.localKey);
          l.pendingMints = l.pendingMints.filter(m => m.requestKey !== pending.requestKey);
        });
        retry = 0;
      } else if (!(error instanceof LeagueApiError) || error.retryable || error.status === 429) {
        retry++;
        if (retry <= 5)
          timer = setTimeout(
            () => {
              timer = undefined;
              void process();
            },
            1000 * 2 ** (retry - 1),
          );
      } else {
        retry = 6;
      }
    } finally {
      busy = false;
      changing = false;
    }
    if (!stopped && !timer && retry === 0 && storage.getEnvelope().league.pendingMints.length)
      void process();
  }
  const unsubscribe = store.subscribe(observe);
  const online = () => {
    retry = 0;
    if (timer) clearTimeout(timer);
    timer = undefined;
    observe();
  };
  window.addEventListener("online", online);
  observe();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
    window.removeEventListener("online", online);
  };
}
