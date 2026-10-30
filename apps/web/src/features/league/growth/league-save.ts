import type {
  GameStateStorage,
  LocalPlayersSaveState,
  PlayerPokemon,
} from "@/features/poke-lounge/contracts/game-state";
import { sanitizeLocalPlayersSaveState } from "@/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";
import { normalizeGen4Traits } from "@poke-lounge/battle/gen4/traits";
import { GEN4_STATUSES } from "@poke-lounge/battle/gen4/types";
import { isRecord } from "@/lib/is-record";
import type { LeagueGrowthView } from "../contract";

export interface LeagueSaveEnvelope {
  version: 1;
  runId: string;
  seasonId: number;
  userId: string;
  rev: number;
  serverRev: number;
  dirty: boolean;
  savedAtMs: number;
  game: LocalPlayersSaveState;
  league: {
    monIds: Record<string, string>;
    pendingMints: Array<{
      localKey: string;
      speciesId: number;
      level: number;
      requestKey: string;
      createdAtMs: number;
    }>;
    rejectedMints: string[];
    badges: number;
    growth: LeagueGrowthView;
  };
}
const PREFIX = "poke-lounge-league:v1:run:";
function storages(): Storage[] {
  const result: Storage[] = [];
  try {
    result.push(window.localStorage);
  } catch {
    /* Use session storage when local storage is blocked. */
  }
  try {
    result.push(window.sessionStorage);
  } catch {
    /* Keep the active in-memory save. */
  }
  return result;
}
function sanitizeLeagueGame(value: unknown): LocalPlayersSaveState | null {
  if (!isRecord(value) || !isRecord(value.playersById)) return null;
  // The shared legacy sanitizer supports fewer statuses and omits Gen4 traits.
  const compatiblePokemon = (pokemon: unknown) =>
    isRecord(pokemon) && GEN4_STATUSES.includes(pokemon.status as PlayerPokemon["status"] & string)
      ? { ...pokemon, status: "normal" }
      : pokemon;
  const playersById = Object.fromEntries(
    Object.entries(value.playersById).map(([id, player]) => [
      id,
      isRecord(player)
        ? {
            ...player,
            party: Array.isArray(player.party)
              ? player.party.map(slot =>
                  isRecord(slot) ? { ...slot, pokemon: compatiblePokemon(slot.pokemon) } : slot,
                )
              : player.party,
            pokemonBox: Array.isArray(player.pokemonBox)
              ? player.pokemonBox.map(compatiblePokemon)
              : player.pokemonBox,
          }
        : player,
    ]),
  );
  const game = sanitizeLocalPlayersSaveState({ ...value, playersById });
  if (!game) return null;
  const original = value as unknown as LocalPlayersSaveState;
  const restore = (pokemon: PlayerPokemon, source: PlayerPokemon): PlayerPokemon => ({
    ...pokemon,
    ...normalizeGen4Traits(pokemon.speciesId, {
      natureId: source.natureId,
      abilityId: source.abilityId,
      heldItemId: source.heldItemId,
      effortValues: source.effortValues,
      happiness: source.happiness,
      statusTurns: Number.isFinite(source.statusTurns) ? source.statusTurns : undefined,
    }),
    ...(source.status === undefined ? {} : { status: source.status }),
    ...Object.fromEntries(
      ["attack", "defense", "speed"].flatMap(key => {
        const stat = source[key as "attack" | "defense" | "speed"];
        return Number.isSafeInteger(stat) && stat! >= 0 ? [[key, stat]] : [];
      }),
    ),
  });
  for (const [id, player] of Object.entries(game.playersById)) {
    const source = original.playersById[id]!;
    player.party = player.party.map((slot, i) => ({
      ...slot,
      pokemon: slot.pokemon ? restore(slot.pokemon, source.party[i]!.pokemon!) : null,
    }));
    player.pokemonBox = player.pokemonBox.map((pokemon, i) =>
      restore(pokemon, source.pokemonBox[i]!),
    );
  }
  return game;
}
export function parseLeagueSave(
  value: unknown,
  runId: string,
  userId?: string,
): LeagueSaveEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const save = value as LeagueSaveEnvelope;
  const game = sanitizeLeagueGame(save.game);
  if (
    save.version !== 1 ||
    save.runId !== runId ||
    (userId !== undefined && save.userId !== userId) ||
    !Number.isInteger(save.seasonId) ||
    !Number.isSafeInteger(save.rev) ||
    save.rev < 0 ||
    !Number.isSafeInteger(save.serverRev) ||
    save.serverRev < 0 ||
    typeof save.dirty !== "boolean" ||
    !Number.isFinite(save.savedAtMs) ||
    !game ||
    !save.league ||
    typeof save.league.monIds !== "object" ||
    !save.league.monIds ||
    !Array.isArray(save.league.pendingMints) ||
    !Array.isArray(save.league.rejectedMints) ||
    save.league.growth?.rulesVersion !== 1 ||
    !Number.isInteger(save.league.growth.expMultiplierPermille) ||
    save.league.growth.expMultiplierPermille < 1000 ||
    save.league.growth.expMultiplierPermille > 20000
  )
    return null;
  return { ...save, game };
}
export function readLeagueSave(runId: string, userId?: string): LeagueSaveEnvelope | null {
  const candidates = storages().flatMap(storage => {
    try {
      const save = parseLeagueSave(
        JSON.parse(storage.getItem(PREFIX + runId) ?? "null"),
        runId,
        userId,
      );
      return save ? [save] : [];
    } catch {
      return [];
    }
  });
  return candidates.sort((a, b) => b.savedAtMs - a.savedAtMs)[0] ?? null;
}
export function writeLeagueSave(save: LeagueSaveEnvelope): void {
  for (const storage of storages()) {
    try {
      storage.setItem(PREFIX + save.runId, JSON.stringify(save));
      return;
    } catch {
      /* Try the next storage. */
    }
  }
}
export function cleanLeagueSaves(currentRunId: string | null): void {
  for (const storage of storages()) {
    try {
      for (const key of Object.keys(storage))
        if (key.startsWith(PREFIX) && key !== PREFIX + currentRunId) storage.removeItem(key);
    } catch {
      /* Storage may be blocked. */
    }
  }
}
export interface LeagueSaveStorage extends GameStateStorage {
  getEnvelope(): LeagueSaveEnvelope;
  updateLeague(update: (league: LeagueSaveEnvelope["league"]) => void): void;
  replace(save: LeagueSaveEnvelope, checkpoint?: boolean): void;
  acknowledge(rev: number, uploadedRevision: number): void;
  subscribe(listener: (checkpoint: boolean) => void): () => void;
}
function checkpointSignature(game: LocalPlayersSaveState): string {
  return JSON.stringify(
    Object.values(game.playersById).map(({ position: _position, ...player }) => player),
  );
}
export function createLeagueSaveStorage(initial: LeagueSaveEnvelope): LeagueSaveStorage {
  let save = structuredClone(initial);
  let signature = checkpointSignature(save.game);
  const listeners = new Set<(checkpoint: boolean) => void>();
  const publish = (checkpoint: boolean, change = true) => {
    save = {
      ...save,
      ...(change ? { rev: save.rev + 1, dirty: true, savedAtMs: Date.now() } : {}),
    };
    writeLeagueSave(save);
    listeners.forEach(listener => listener(checkpoint));
  };
  return {
    getEnvelope: () => save,
    loadLocalPlayers: () => save.game,
    saveLocalPlayers(game) {
      const clean = sanitizeLeagueGame(game);
      if (!clean) return;
      const next = checkpointSignature(clean);
      save = { ...save, game: clean };
      publish(next !== signature);
      signature = next;
    },
    clear() {
      cleanLeagueSaves(null);
    },
    updateLeague(update) {
      const league = structuredClone(save.league);
      update(league);
      save = { ...save, league };
      publish(true);
    },
    replace(next, checkpoint = false) {
      save = structuredClone(next);
      signature = checkpointSignature(save.game);
      publish(checkpoint, false);
    },
    acknowledge(rev, uploadedRevision) {
      save = { ...save, serverRev: rev, dirty: save.rev !== uploadedRevision };
      publish(false, false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
