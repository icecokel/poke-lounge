"use client";
import { useEffect, useRef, useState } from "react";
import {
  LEAGUE_MATCH_RULES,
  startLeagueMatch,
  applyPlayerInput,
  measureLeagueMatch,
  type LeagueMatchProgress,
} from "@poke-lounge/battle/league/match";
import { leagueTrainerExperience } from "@poke-lounge/battle/league/growth/experience";
import { getRuntimeGrowthExperienceTable } from "@poke-lounge/battle/adventure/data/game-data-json";
import {
  localizeMoveName,
  localizePokemonName,
} from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import { applyExperienceGain } from "@poke-lounge/battle/adventure/battle/experience";
import { planLevelUpPlayerProgression } from "@poke-lounge/battle/adventure/battle/level-up-progression";
import {
  createStoredBattlePokemon,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "@poke-lounge/battle/adventure/battle/wild-battle-factory";
import { getPokemonIdentityKey } from "@/features/poke-lounge/domain/player/player-helpers";
import { getRuntimePokemonData } from "@poke-lounge/battle/adventure/data/game-data-json";
import { LeagueApiError, withLeagueRetry } from "../api/core";
import {
  startLeagueBadge,
  submitLeagueBadge,
  type BadgeBattleView,
  type BadgeSubmission,
} from "../api/growth";
import type { LeagueGrowthScreenProps, LeagueJudgedBattleProps } from "../contract";
import { buildLeaguePartyClaim } from "./claim";
import type { GrowthSession } from "./league-growth-screen";
import type { GrowthCopy } from "./copy";

function applyBadgeGrowth(
  session: GrowthSession,
  progress: LeagueMatchProgress,
  participants: number[],
  won: boolean,
  runtime: LeagueGrowthScreenProps["runtime"],
) {
  const player = session.store.getCurrentLocalPlayer();
  if (!won) {
    session.store.healCurrentParty();
    return;
  }
  const perOpponent = new Map<number, Set<number>>();
  function seen(opponent: number, slot: number) {
    let set = perOpponent.get(opponent);
    if (!set) {
      set = new Set();
      perOpponent.set(opponent, set);
    }
    set.add(slot);
  }
  let replay = startLeagueMatch(progress.init);
  seen(replay.frame.parties[1].activeSlotIndex, replay.frame.parties[0].activeSlotIndex);
  for (const input of progress.inputs) {
    replay = applyPlayerInput(replay, input);
    for (const step of replay.steps) seen(step.opponentSlotIndex, step.playerSlotIndex);
    seen(replay.frame.parties[1].activeSlotIndex, replay.frame.parties[0].activeSlotIndex);
  }
  const end = progress.frame.parties[0];
  const raw = getRuntimePokemonData() as {
    species?: Record<string, { baseExpYield: number }>;
  } | null;
  const gainBySlot = new Map<number, number>();
  for (const opponent of progress.frame.parties[1].members.filter(m => (m.currentHp ?? 0) === 0)) {
    const eligible = [...(perOpponent.get(opponent.slotIndex) ?? new Set(participants))].filter(
      slot => end.members.some(m => m.slotIndex === slot && (m.currentHp ?? 0) > 0),
    );
    const gained = leagueTrainerExperience(
      raw?.species?.[opponent.speciesId]?.baseExpYield ?? 0,
      opponent.level,
      session.storage.getEnvelope().league.growth.expMultiplierPermille,
      eligible.length,
    );
    for (const slot of eligible) gainBySlot.set(slot, (gainBySlot.get(slot) ?? 0) + gained);
  }
  const pending = player.deferredMoveLearnings?.slice() ?? [];
  const party = player.party.map(slot => {
    const pokemon = slot.pokemon;
    const final = end.members.find(m => m.slotIndex === slot.slotIndex);
    if (!pokemon || !final) return slot;
    const gain = applyExperienceGain({
      currentExperience: pokemon.experience ?? 0,
      currentLevel: pokemon.level,
      growthRate: pokemon.growthRate ?? 0,
      gainedExperience: gainBySlot.get(slot.slotIndex) ?? 0,
    });
    if (gain.level === 100)
      gain.experience =
        getRuntimeGrowthExperienceTable(pokemon.growthRate ?? 0)[100] ?? gain.experience;
    const after = {
      ...pokemon,
      ...gain,
      currentHp: final.currentHp,
      status: final.status ?? "normal",
      statusTurns: final.statusTurns,
      moves: pokemon.moves?.map(move => ({
        ...move,
        pp: final.moves.find(m => m.moveId === move.id)?.pp ?? move.pp,
      })),
    };
    const result = planLevelUpPlayerProgression({
      pokemon: after,
      pokemonData: getRuntimePokemonData(),
      previousLevel: pokemon.level,
    });
    const stats = createStoredBattlePokemon({
      pokemon: result.pokemon,
      personalRecords: runtime.runtimeAssets.json.get(
        "romPersonalData",
      ) as RomPersonalRecordCollection,
      moveRecords: runtime.runtimeAssets.json.get(
        "romRefinedBattleRecords",
      ) as RomRefinedMoveCollection,
    });
    const currentHp =
      (final.currentHp ?? 0) === 0
        ? 0
        : Math.min(
            stats.maxHp,
            Math.max(
              1,
              (result.pokemon.currentHp ?? 0) + stats.maxHp - (result.pokemon.maxHp ?? stats.maxHp),
            ),
          );
    for (const move of result.pendingMoveReplacements)
      pending.push({ pokemonKey: getPokemonIdentityKey(pokemon)!, move });
    return {
      ...slot,
      pokemon: {
        ...result.pokemon,
        maxHp: stats.maxHp,
        currentHp,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
      },
    };
  });
  session.store.upsertLocalPlayer({
    ...player,
    party,
    activePartySlotIndex: end.activeSlotIndex,
    deferredMoveLearnings: pending,
  });
}
export function BadgeFlow({
  session,
  runtime,
  JudgedBattle,
  copy,
  onDone,
  onBack,
  onRunClosed,
}: {
  session: GrowthSession;
  runtime: LeagueGrowthScreenProps["runtime"];
  JudgedBattle: LeagueGrowthScreenProps["JudgedBattle"];
  copy: GrowthCopy;
  onDone(message: string): void;
  onBack(): void;
  onRunClosed(): void;
}) {
  const requestKey = useRef(crypto.randomUUID());
  const [battle, setBattle] = useState<BadgeBattleView | null>(null);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState<
    Parameters<LeagueJudgedBattleProps["onFinished"]>[0] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retired, setRetired] = useState(false);
  const applied = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const claim = buildLeaguePartyClaim(session.storage.getEnvelope());
    if (!claim.ok) {
      setError(copy.mintError);
      return;
    }
    void withLeagueRetry(() =>
      startLeagueBadge(session.storage.getEnvelope().runId, claim.claim, requestKey.current),
    )
      .then(result => {
        if (!cancelled) setBattle(result);
      })
      .catch(error => {
        if (cancelled) return;
        if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE")
          onRunClosed();
        else
          setError(
            error instanceof LeagueApiError && error.code === "LEAGUE_PARTY_IMPLAUSIBLE"
              ? `${copy.partyError} ${JSON.stringify(error.detail)}`
              : copy.error,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [session, copy, attempt, onRunClosed]);
  async function submit(result: NonNullable<typeof finished>) {
    if (!battle || submitting.current || applied.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const local = measureLeagueMatch(result.progress);
    const body: BadgeSubmission = {
      contractVersion: 1,
      engineVersion: battle.engineVersion,
      leadSlot: result.leadSlot,
      startHash: battle.carryHash,
      inputs: [...result.progress.inputs],
      client: {
        winner: local.status === "won" ? 0 : local.status === "lost" ? 1 : null,
        turns: local.turns,
        endHash: local.endHash,
      },
    };
    try {
      const response = await withLeagueRetry(() => submitLeagueBadge(battle.battleId, body));
      if (applied.current) return;
      applied.current = true;
      applyBadgeGrowth(
        session,
        result.progress,
        result.participants,
        response.status === "won",
        runtime,
      );
      session.storage.updateLeague(l => {
        l.badges = response.run.badges;
      });
      onDone(
        `${response.status !== local.status || response.measure.endHash !== local.endHash ? copy.serverResult + " · " : ""}${response.status === "won" ? copy.victory : copy.defeat}`,
      );
    } catch (error) {
      if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE") onRunClosed();
      else if (
        error instanceof LeagueApiError &&
        (error.code === "LEAGUE_ENGINE_RETIRED" || error.code === "LEAGUE_ENGINE_VERSION_MISMATCH")
      ) {
        setRetired(true);
        setError(copy.retired);
      } else setError(copy.error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (finished)
    return (
      <div className="space-y-4" aria-live="polite">
        {busy ? (
          <p>{copy.saving}</p>
        ) : (
          <>
            <p role="alert">{error}</p>
            {!retired && (
              <button className="rounded border px-4 py-2" onClick={() => void submit(finished)}>
                {copy.submitLater}
              </button>
            )}
            <button className="ml-3 rounded border px-4 py-2" onClick={onBack}>
              {copy.back}
            </button>
          </>
        )}
      </div>
    );
  if (error)
    return (
      <div role="alert">
        {error}
        <button
          onClick={() => {
            setError("");
            setAttempt(n => n + 1);
          }}
        >
          {copy.retry}
        </button>
        <button onClick={onBack}>{copy.back}</button>
      </div>
    );
  if (!battle) return <p role="status">{copy.loading}</p>;
  return (
    <JudgedBattle
      mode="badge"
      runtime={runtime}
      init={{
        seed: battle.seed,
        challenger: battle.challengerParty,
        opponent: battle.npc.party,
        rules: LEAGUE_MATCH_RULES,
      }}
      opponent={{ displayName: battle.npc.displayName }}
      matchLabel={`${copy.badges} ${battle.badgeIndex + 1}/8`}
      onFinished={result => {
        setFinished(result);
        void submit(result);
      }}
      onAbort={onBack}
    />
  );
}

export function BadgeMoveLearning({
  session,
  copy,
  runtime,
}: {
  session: GrowthSession;
  copy: GrowthCopy;
  runtime: LeagueGrowthScreenProps["runtime"];
}) {
  const player = session.store.getCurrentLocalPlayer();
  const learning = player.deferredMoveLearnings?.[0];
  if (!learning) return null;
  const pokemon = [
    ...player.party.flatMap(s => (s.pokemon ? [s.pokemon] : [])),
    ...player.pokemonBox,
  ].find(p => getPokemonIdentityKey(p) === learning.pokemonKey);
  return (
    <section className="space-y-4 rounded border p-5">
      <h2>
        {pokemon ? localizePokemonName(pokemon.name, runtime.locale) : copy.party} · {copy.moves}
      </h2>
      <p>{localizeMoveName(learning.move.name, runtime.locale)}</p>
      {pokemon?.moves?.map((move, index) => (
        <button
          className="mr-3 rounded border px-4 py-2"
          key={move.id}
          onClick={() => session.store.resolveDeferredMoveLearning(learning, index)}
        >
          {localizeMoveName(move.name, runtime.locale)} →{" "}
          {localizeMoveName(learning.move.name, runtime.locale)}
        </button>
      ))}
      <button
        className="rounded border px-4 py-2"
        onClick={() => session.store.resolveDeferredMoveLearning(learning, null)}
      >
        {copy.skip}
      </button>
    </section>
  );
}
