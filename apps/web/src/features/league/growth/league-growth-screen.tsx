"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import {
  createDefaultLocalPlayer,
  createGameStateStore,
} from "@/components/poke-lounge/runtime/game/state/game-state-store";
import type { GameStateStore, PlayerPokemon } from "@/features/poke-lounge/contracts/game-state";
import {
  createStoredBattlePokemon,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "@poke-lounge/battle/adventure/battle/wild-battle-factory";
import { createPlayerPokemonMovesForLevel } from "@poke-lounge/battle/adventure/battle/level-up-moves";
import {
  getRuntimeGrowthExperienceTable,
  getRuntimePokemonSpeciesGrowthRate,
  getRuntimePokemonSpeciesSummary,
} from "@poke-lounge/battle/adventure/data/game-data-json";
import { getPokemonIdentityKey } from "@/features/poke-lounge/domain/player/player-helpers";
import { LeagueApiError } from "../api/core";
import { loadLeagueSave, type GrowthStart } from "../api/growth";
import type { LeagueGrowthScreenProps } from "../contract";
import {
  createLeagueSaveStorage,
  readLeagueSave,
  cleanLeagueSaves,
  type LeagueSaveEnvelope,
  type LeagueSaveStorage,
} from "./league-save";
import { reconcileLeagueSave, startServerSaveSync } from "./server-save-sync";
import { startLeagueMintQueue } from "./mint-queue";
import { NicknameForm } from "./nickname-form";
import { StarterSelect } from "./starter-select";
import { LeagueFieldRuntime } from "./field-runtime";
import { GrowthHud } from "./growth-hud";
import { growthCopy } from "./copy";

export interface GrowthSession {
  storage: LeagueSaveStorage;
  store: GameStateStore;
}
function initialSave(
  result: GrowthStart,
  userId: string,
  seasonId: number,
  nickname: string,
  props: LeagueGrowthScreenProps,
): LeagueSaveEnvelope {
  const mon = result.starter;
  const growthRate = getRuntimePokemonSpeciesGrowthRate(mon.speciesId) ?? 0;
  const starter: PlayerPokemon = {
    ...mon,
    name: getRuntimePokemonSpeciesSummary(mon.speciesId)?.name ?? `#${mon.speciesId}`,
    experience: getRuntimeGrowthExperienceTable(growthRate)[mon.level] ?? 0,
    growthRate,
    happiness: 70,
    heldItemId: 0,
    effortValues: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: createPlayerPokemonMovesForLevel(mon.speciesId, mon.level),
  };
  const battle = createStoredBattlePokemon({
    pokemon: starter,
    personalRecords: props.runtime.runtimeAssets.json.get(
      "romPersonalData",
    ) as RomPersonalRecordCollection,
    moveRecords: props.runtime.runtimeAssets.json.get(
      "romRefinedBattleRecords",
    ) as RomRefinedMoveCollection,
  });
  const player = createDefaultLocalPlayer(userId);
  player.displayName = nickname;
  player.inventory = { pokeball: 99 };
  player.party[0] = {
    slotIndex: 0,
    pokemon: {
      ...starter,
      maxHp: battle.maxHp,
      currentHp: battle.maxHp,
      attack: battle.attack,
      defense: battle.defense,
      speed: battle.speed,
      status: "normal",
    },
  };
  return {
    version: 1,
    runId: result.run.id,
    seasonId,
    userId,
    rev: 1,
    serverRev: 0,
    dirty: true,
    savedAtMs: Date.now(),
    game: { currentPlayerId: userId, playersById: { [userId]: player } },
    league: {
      monIds: { [getPokemonIdentityKey(starter)!]: mon.monId },
      pendingMints: [],
      rejectedMints: [],
      badges: result.run.badges,
      growth: result.growth,
    },
  };
}
export function LeagueGrowthScreen(props: LeagueGrowthScreenProps) {
  const { runtime, status, me, onExit } = props;
  const copy = growthCopy(runtime.locale);
  const [nickname, setNickname] = useState(me.user.nickname ?? null);
  const [session, setSession] = useState<GrowthSession | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState("local");
  const [retry, setRetry] = useState(0);
  const [conflict, setConflict] = useState<{
    local: LeagueSaveEnvelope;
    remote: LeagueSaveEnvelope;
  } | null>(null);
  const [created, setCreated] = useState<GrowthStart | null>(null);
  const run = created?.run ?? me.run;
  const closed = useCallback(() => {
    cleanLeagueSaves(null);
    onExit("run-changed");
  }, [onExit]);
  const activate = useCallback((save: LeagueSaveEnvelope) => {
    const storage = createLeagueSaveStorage(save);
    setSession({ storage, store: createGameStateStore({ storage }) });
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError("");
    if (!run || !nickname || !status.season) return;
    const runId = run.id;
    const seasonId = status.season.id;
    void (async () => {
      const account = await fetchAccountSession();
      if (!account.user) throw new Error("UNAUTHORIZED");
      if (cancelled) return;
      cleanLeagueSaves(runId);
      if (created) {
        activate(initialSave(created, account.user.id, seasonId, nickname, props));
        return;
      }
      const remote = await loadLeagueSave(runId);
      if (cancelled) return;
      const local = readLeagueSave(runId, account.user.id);
      const result = reconcileLeagueSave(local, remote.save, runId, account.user.id);
      if (result.save && result.conflict) {
        setConflict({ local: result.save, remote: result.conflict });
        return;
      }
      const save =
        result.save ??
        initialSave(
          { run: remote.run, starter: remote.starter, growth: remote.growth },
          account.user.id,
          seasonId,
          nickname,
          props,
        );
      if (!result.save) setNotice(copy.noSave);
      save.league.badges = remote.run.badges;
      save.league.growth = remote.growth;
      activate(save);
    })().catch(error => {
      if (cancelled) return;
      if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE") closed();
      else setError(copy.saveInvalid);
    });
    return () => {
      cancelled = true;
    };
    // Runtime and account stay fixed for this growth screen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, nickname, retry, created, activate, closed]);
  useEffect(() => {
    if (!session) return;
    const sync = startServerSaveSync(
      session.storage,
      setSaving,
      remote => setConflict({ local: structuredClone(session.storage.getEnvelope()), remote }),
      closed,
    );
    const stopMints = startLeagueMintQueue(
      session.store,
      session.storage,
      runtime.runtimeAssets,
      closed,
    );
    return () => {
      void sync.flush(true);
      sync.stop();
      stopMints();
    };
  }, [session, runtime, closed]);
  function chooseSave(save: LeagueSaveEnvelope) {
    if (!conflict) return;
    const selected = {
      ...save,
      serverRev: conflict.remote.serverRev,
      dirty: true,
      rev: Math.max(save.rev, conflict.remote.rev) + 1,
    };
    setConflict(null);
    activate(selected);
  }
  if (conflict)
    return (
      <section className="space-y-4">
        <h2>{copy.conflict}</h2>
        <p>{copy.conflictHelp}</p>
        {(
          [
            [copy.localSave, conflict.local],
            [copy.serverSave, conflict.remote],
          ] as const
        ).map(([label, save]) => (
          <button key={label} className="block rounded border p-4" onClick={() => chooseSave(save)}>
            {label} · {new Date(save.savedAtMs).toLocaleString(runtime.locale)} · {copy.badges}{" "}
            {save.league.badges}/8 ·{" "}
            {save.game.playersById[save.game.currentPlayerId]?.party
              .flatMap(s => (s.pokemon ? [`${s.pokemon.name} Lv${s.pokemon.level}`] : []))
              .join(", ")}
          </button>
        ))}
      </section>
    );
  if (!nickname) return <NicknameForm copy={copy} onSaved={setNickname} />;
  if (!status.season) return <p>{copy.noSeason}</p>;
  if (!run)
    return (
      <StarterSelect
        season={status.season}
        locale={runtime.locale}
        copy={copy}
        onStarted={setCreated}
        onRunChanged={closed}
      />
    );
  if (error)
    return (
      <div role="alert">
        {error}
        <button
          onClick={() => {
            setError("");
            setRetry(n => n + 1);
          }}
        >
          {copy.retry}
        </button>
        <button onClick={() => onExit("home")}>{copy.home}</button>
      </div>
    );
  if (!session) return <p role="status">{copy.loading}</p>;
  return (
    <section className="space-y-3">
      {notice && <p role="status">{notice}</p>}
      <GrowthHud
        storage={session.storage}
        copy={copy}
        status={saving}
        onExit={() => onExit("home")}
      />
      <LeagueFieldRuntime
        runtime={runtime}
        store={session.store}
        expMultiplierPermille={session.storage.getEnvelope().league.growth.expMultiplierPermille}
        onExit={() => onExit("home")}
      />
    </section>
  );
}
