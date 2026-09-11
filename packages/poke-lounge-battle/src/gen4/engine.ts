import { withSubjectParticle } from "../battle-message-text";
import { createDefaultBattleStatStages } from "../battle-stat-stages";
import { hgssPhazingSucceeds } from "./flow";
import { serializeGen4Battle } from "./serialization";
import {
  Battle,
  Dex,
  toID,
  type Pokemon,
  type PokemonSet,
  type Side,
  type ModdedMoveDataTable,
  type ModdedSpeciesDataTable,
} from "@pkmn/sim";
import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "../competitive-catalog.generated";
import { GEN4_ROM_ITEMS, GEN4_ROM_MOVE_NAMES, GEN4_ROM_SPECIES } from "./rom-catalog.generated";
import {
  GEN4_NATURES,
  GEN4_ZERO_EVS,
  type Gen4Action,
  type Gen4ActionRequest,
  type Gen4Frame,
  type Gen4Member,
  type Gen4Party,
  type Gen4Session,
  type Gen4Status,
  type Gen4Step,
  type Gen4StatValues,
} from "./types";

const FORMAT = "pokeloungehgss";
const TYPE_NAMES = [
  "Normal",
  "Fighting",
  "Flying",
  "Poison",
  "Ground",
  "Rock",
  "Bug",
  "Ghost",
  "Steel",
  "???",
  "Fire",
  "Water",
  "Grass",
  "Electric",
  "Psychic",
  "Ice",
  "Dragon",
  "Dark",
];
const STAT_MAP = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  speed: "spe",
  specialAttack: "spa",
  specialDefense: "spd",
} as const;
const STATUS_TO_SIM: Record<Gen4Status, string> = {
  normal: "",
  poisoned: "psn",
  badlyPoisoned: "tox",
  burned: "brn",
  paralyzed: "par",
  asleep: "slp",
  frozen: "frz",
  fainted: "",
};
const STATUS_FROM_SIM: Record<string, Gen4Status> = {
  "": "normal",
  psn: "poisoned",
  tox: "badlyPoisoned",
  brn: "burned",
  par: "paralyzed",
  slp: "asleep",
  frz: "frozen",
};
const STATUS_KO: Record<string, string> = {
  psn: "독",
  tox: "맹독",
  brn: "화상",
  par: "마비",
  slp: "잠듦",
  frz: "얼음",
  confusion: "혼란",
  flinch: "풀죽음",
  recharge: "반동으로 인한 휴식",
};
const CONDITION_KO: Record<string, string> = {
  leechseed: "씨뿌리기",
  confusion: "혼란",
  taunt: "도발",
  substitute: "대타출동",
  protect: "방어",
  reflect: "리플렉터",
  lightscreen: "빛의장막",
  safeguard: "신비의부적",
  mist: "흰안개",
  spikes: "압정뿌리기",
  stealthrock: "스텔스록",
  toxicspikes: "독압정",
  trickroom: "트릭룸",
  sandstorm: "모래바람",
  raindance: "비",
  sunnyday: "쾌청",
  hail: "싸라기눈",
  none: "날씨 종료",
  encore: "앵콜",
  disable: "사슬묶기",
  perishsong: "멸망의노래",
  focusenergy: "기충전",
  ingrain: "뿌리박기",
  aquaring: "아쿠아링",
};
const baseDex = Dex.forGen(4);
const moveByNum = new Map(
  baseDex.moves
    .all()
    .filter(m => m.num >= 1 && m.num <= 467 && !m.id.startsWith("hiddenpower"))
    .map(m => [m.num, m]),
);
moveByNum.set(237, baseDex.moves.get("hiddenpower"));
const speciesByNum = new Map(
  baseDex.species
    .all()
    .filter(s => s.num >= 1 && s.num <= 493 && !s.forme)
    .map(s => [s.num, s]),
);
const abilitiesByNum = new Map(
  baseDex.abilities
    .all()
    .filter(a => a.num > 0 && a.num <= 123)
    .map(a => [a.num, a]),
);
const itemsByNum = new Map(
  baseDex.items
    .all()
    .filter(i => i.gen <= 4 && i.num > 0)
    .map(i => [i.num, i]),
);
type TaggedSet = PokemonSet & { plMember: Gen4Member; plWild?: boolean };
type CartridgeBattle = Battle & { plWild?: boolean; plEscapeSide?: 0 | 1 };
const originalRunAction = Battle.prototype.runAction;
let registered = false;

/** The pinned engine supplies Gen4 execution, while Korean-ROM numeric records are authoritative. */
function registerFormat(): void {
  if (registered) return;
  const moves: ModdedMoveDataTable = {};
  for (const [key, record] of Object.entries(COMPETITIVE_MOVE_CATALOG)) {
    const template = moveByNum.get(+key);
    if (!template) throw Error(`Missing Gen4 move implementation ${key}`);
    moves[template.id] = {
      inherit: true,
      basePower: record.power,
      accuracy: record.accuracy || true,
      pp: record.maxPp,
      priority: record.priority,
      category: (record.category[0]!.toUpperCase() + record.category.slice(1)) as
        "Physical" | "Special" | "Status",
      type: TYPE_NAMES[record.typeId]!,
    };
  }
  moves.teleport = {
    ...moves.teleport,
    inherit: true,
    onTry(_target, source) {
      return (
        (this as CartridgeBattle).plWild &&
        (source.hasAbility("runaway") || source.hasItem("smokeball") || !source.trapped)
      );
    },
    onHit(_target, source) {
      finishWildEscape(this, source);
    },
    selfSwitch: false,
  };
  for (const id of ["roar", "whirlwind"] as const)
    moves[id] = {
      ...moves[id],
      inherit: true,
      onTryHit(target, source, move) {
        if (!(this as CartridgeBattle).plWild && !this.canSwitch(target.side)) return false;
        if (
          !hgssPhazingSucceeds(
            source.level,
            target.level,
            source.level >= target.level ? 0 : this.random(256),
          )
        )
          return false;
        if ((this as CartridgeBattle).plWild && !this.runEvent("DragOut", target, source, move))
          return false;
      },
      onHit(target, source, move) {
        if ((this as CartridgeBattle).plWild) {
          move.forceSwitch = false;
          finishWildEscape(this, source);
        }
      },
    };
  const species: ModdedSpeciesDataTable = {};
  for (const [key, record] of Object.entries(COMPETITIVE_SPECIES_CATALOG)) {
    const template = speciesByNum.get(+key),
      rom = GEN4_ROM_SPECIES[+key]!;
    if (!template) throw Error(`Missing Gen4 species ${key}`);
    species[template.id] = {
      inherit: true,
      baseStats: toSimStats(record.baseStats),
      types: record.typeIds.map(id => TYPE_NAMES[id]!),
      abilities: {
        0: abilitiesByNum.get(rom.abilities[0]!)?.name ?? template.abilities[0],
        ...(rom.abilities[1] ? { 1: abilitiesByNum.get(rom.abilities[1])!.name } : {}),
      },
    };
  }
  Dex.mod(FORMAT, {
    Scripts: { inherit: "gen4", gen: 4 },
    Moves: moves as NonNullable<Parameters<typeof Dex.mod>[1]>["Moves"],
    Pokedex: species as NonNullable<Parameters<typeof Dex.mod>[1]>["Pokedex"],
  });
  Dex.formats.extend([
    {
      name: "Poke Lounge HGSS",
      mod: FORMAT,
      gameType: "singles",
      ruleset: [],
      debug: true,
      onBegin() {
        (this as CartridgeBattle).plWild = Boolean((this.p1.pokemon[0]!.set as TaggedSet).plWild);
        for (const side of this.sides) {
          for (const pokemon of side.pokemon) initializePokemon(this, pokemon);
          side.pokemonLeft = side.pokemon.filter(p => p.hp > 0).length;
        }
      },
      battle: {
        runAction(this: Battle, action: Parameters<Battle["runAction"]>[0]) {
          if (action.choice === "event" && action.event === "PokeLoungeBag") {
            const tagged = action as typeof action & { plItemId: number; plTargetSlot: number };
            applyBagItem(this, action.pokemon.side, tagged.plItemId, tagged.plTargetSlot);
            return;
          }
          return originalRunAction.call(this, action);
        },
      },
    },
  ]);
  registered = true;
}
function toSimStats(stats: Gen4StatValues) {
  return {
    hp: stats.hp,
    atk: stats.attack,
    def: stats.defense,
    spe: stats.speed,
    spa: stats.specialAttack,
    spd: stats.specialDefense,
  };
}
function slot(p: Pokemon): number {
  return (p.set as TaggedSet).plMember.slotIndex;
}
function status(p: Pokemon): Gen4Status {
  return p.hp <= 0 ? "fainted" : (STATUS_FROM_SIM[p.status] ?? "normal");
}
function initializePokemon(battle: Battle, p: Pokemon): void {
  const member = (p.set as TaggedSet).plMember;
  if (!member) throw Error("Missing original party slot");
  // Stored stats are needed by pre-existing saves and deterministic canonical snapshots.
  if (member.maxHp !== undefined) p.maxhp = member.speciesId === 292 ? 1 : member.maxHp;
  p.baseMaxhp = p.maxhp;
  p.baseStoredStats.hp = p.maxhp;
  for (const key of ["attack", "defense", "speed", "specialAttack", "specialDefense"] as const) {
    const value = member[key];
    if (value !== undefined) {
      p.storedStats[STAT_MAP[key]] = value;
      p.baseStoredStats[STAT_MAP[key]] = value;
    }
  }
  p.hp = Math.max(0, Math.min(p.maxhp, member.currentHp ?? p.maxhp));
  p.fainted = p.hp === 0;
  p.status = toID(STATUS_TO_SIM[member.status ?? "normal"]);
  p.statusState = battle.initEffectState({
    id: p.status,
    target: p,
    ...(p.status === "slp"
      ? { time: member.statusTurns ?? battle.random(2, 6), startTime: member.statusTurns ?? 3 }
      : {}),
    ...(p.status === "tox" ? { stage: 0 } : {}),
  });
  for (const move of p.moveSlots) {
    const input = member.moves.find(m => m.moveId === battle.dex.moves.get(move.id).num);
    const maxPp = input?.maxPp ?? battle.dex.moves.get(move.id).pp;
    move.maxpp = maxPp;
    move.pp = Math.min(maxPp, input?.pp ?? maxPp);
    const base = p.baseMoveSlots.find(m => m.id === move.id);
    if (base) {
      base.pp = move.pp;
      base.maxpp = maxPp;
    }
  }
  if (member.statStages)
    p.boosts = {
      atk: member.statStages.attack,
      def: member.statStages.defense,
      spa: member.statStages.specialAttack,
      spd: member.statStages.specialDefense,
      spe: member.statStages.speed,
      accuracy: member.statStages.accuracy,
      evasion: member.statStages.evasion,
    };
}
function toSet(member: Gen4Member, wild = false): TaggedSet {
  const species = speciesByNum.get(member.speciesId),
    rom = GEN4_ROM_SPECIES[member.speciesId];
  if (!species || !rom) throw Error("Unsupported ROM species");
  const ability = abilitiesByNum.get(member.abilityId ?? rom.abilities[0]!);
  const evs = member.effortValues ?? GEN4_ZERO_EVS;
  return {
    name: `slot${member.slotIndex}`,
    species: species.name,
    level: member.level,
    ability: ability?.name ?? species.abilities[0],
    item: itemsByNum.get(member.heldItemId ?? 0)?.name ?? "",
    nature: GEN4_NATURES[member.natureId ?? 0] ?? "Hardy",
    gender:
      member.gender === "male"
        ? "M"
        : member.gender === "female"
          ? "F"
          : member.gender === "genderless"
            ? "N"
            : undefined,
    ivs: toSimStats(
      member.individualValues ?? {
        hp: 31,
        attack: 31,
        defense: 31,
        speed: 31,
        specialAttack: 31,
        specialDefense: 31,
      },
    ),
    evs: toSimStats(evs),
    happiness: member.happiness ?? 70,
    moves: member.moves.map(m => {
      const move = moveByNum.get(m.moveId);
      if (!move) throw Error("Unsupported ROM move");
      return move.id;
    }),
    plMember: structuredClone(member),
    plWild: wild,
  } as TaggedSet;
}
function orderedTeam(party: Gen4Party, wild = false): TaggedSet[] {
  if (
    party.members.length < 1 ||
    party.members.length > 6 ||
    new Set(party.members.map(m => m.slotIndex)).size !== party.members.length
  )
    throw Error("Invalid Gen4 team");
  const active =
    party.members.find(
      m => m.slotIndex === party.activeSlotIndex && m.currentHp !== 0 && m.status !== "fainted",
    ) ?? party.members.find(m => m.currentHp !== 0 && m.status !== "fainted");
  if (!active) throw Error("No battle-ready Pokémon");
  return [active, ...party.members.filter(m => m !== active)].map(m => toSet(m, wild));
}
function save(b: Battle): Gen4Session {
  // Showdown includes wall-clock log markers. They are not gameplay and must not change replay hashes.
  for (let i = 0; i < b.log.length; i++) if (b.log[i]!.startsWith("|t:|")) b.log[i] = "|t:|0";
  const object = serializeGen4Battle(b);
  return { version: 1, snapshot: JSON.stringify(object) };
}
function restore(s: Gen4Session): Battle {
  registerFormat();
  if (s.version !== 1 || s.snapshot.length > 8_000_000) throw Error("Invalid Gen4 session");
  const data = JSON.parse(s.snapshot) as { formatid?: string };
  if (data.formatid !== FORMAT) throw Error("Unrecognized battle format");
  return Battle.fromJSON(data);
}
export function createGen4Battle(
  parties: [Gen4Party, Gen4Party],
  random: () => number = Math.random,
  options: { wild?: boolean } = {},
): Gen4Frame {
  registerFormat();
  const seed = [0, 1, 2, 3]
    .map(() => {
      const r = random();
      if (!Number.isFinite(r) || r < 0 || r >= 1) throw Error("Invalid battle RNG");
      return Math.floor(r * 65536);
    })
    .join(",") as `${number},${string}`;
  const b = new Battle({
    formatid: toID(FORMAT),
    seed,
    p1: { name: "P1", team: orderedTeam(parties[0], options.wild) },
    p2: { name: "P2", team: orderedTeam(parties[1], options.wild) },
    strictChoices: true,
  });
  return frame(b, parseLogs(b, b.log, parties));
}
export function readGen4Battle(session: Gen4Session): Gen4Frame {
  return frame(restore(session), []);
}
function request(b: Battle, side: Side): Gen4ActionRequest {
  const raw = side.activeRequest;
  const empty: Gen4ActionRequest = {
    kind: b.ended ? "ended" : "wait",
    moves: [],
    switchSlots: [],
    trapped: false,
    forcedMoveId: null,
    recharge: false,
  };
  if (!raw || raw.wait || b.ended) return empty;
  const switches = side.pokemon.filter(p => p.hp > 0 && !side.active.includes(p)).map(slot);
  if (raw.forceSwitch?.[0]) return { ...empty, kind: "switch", switchSlots: switches };
  if (!("active" in raw)) return empty;
  const active = raw.active[0]!;
  const recharge = active.moves.some(m => m.id === "recharge");
  const forced =
    active.moves.length === 1 &&
    active.moves[0]!.pp === undefined &&
    active.moves[0]!.id !== "struggle";
  return {
    kind: "move",
    trapped: Boolean(active.trapped),
    switchSlots: active.trapped ? [] : switches,
    recharge,
    forcedMoveId: forced && !recharge ? b.dex.moves.get(active.moves[0]!.id).num : null,
    moves: active.moves.map(m => ({
      moveId: m.id === "recharge" ? 0 : b.dex.moves.get(m.id).num,
      pp: m.pp ?? 1,
      maxPp: m.maxpp ?? 1,
      disabled: Boolean(m.disabled),
    })),
  };
}
function exportParty(b: Battle, s: Side): Gen4Party {
  return {
    activeSlotIndex: slot(s.active[0]!),
    members: s.pokemon
      .map(p => {
        const input = (p.set as TaggedSet).plMember;
        return {
          ...input,
          currentHp: p.hp,
          maxHp: p.maxhp,
          status: status(p),
          statusTurns: p.status === "slp" ? Math.max(1, Number(p.statusState.time) || 1) : 0,
          heldItemId: p.getItem().num || 0,
          attack: p.baseStoredStats.atk,
          defense: p.baseStoredStats.def,
          specialAttack: p.baseStoredStats.spa,
          specialDefense: p.baseStoredStats.spd,
          speed: p.baseStoredStats.spe,
          statStages: {
            attack: p.boosts.atk,
            defense: p.boosts.def,
            specialAttack: p.boosts.spa,
            specialDefense: p.boosts.spd,
            speed: p.boosts.spe,
            accuracy: p.boosts.accuracy,
            evasion: p.boosts.evasion,
          },
          moves: (b.ended ? p.baseMoveSlots : p.moveSlots).map(m => ({
            moveId: b.dex.moves.get(m.id).num,
            pp: m.pp,
            maxPp: m.maxpp,
          })),
        };
      })
      .sort((a, c) => a.slotIndex - c.slotIndex),
  };
}
function frame(b: Battle, steps: Gen4Step[]): Gen4Frame {
  return {
    ...((b as CartridgeBattle).plEscapeSide !== undefined
      ? { escapedBy: (b as CartridgeBattle).plEscapeSide }
      : {}),
    session: save(b),
    parties: [exportParty(b, b.p1), exportParty(b, b.p2)],
    requests: [request(b, b.p1), request(b, b.p2)],
    steps,
    turn: b.turn,
    ended: b.ended,
    winner: !b.ended || !b.winner ? null : b.winner === b.p1.name ? 0 : 1,
    weather: b.field.weather,
  };
}
export function defaultGen4Action(r: Gen4ActionRequest): Gen4Action | undefined {
  if (r.kind === "switch")
    return r.switchSlots[0] !== undefined
      ? { kind: "switch", slotIndex: r.switchSlots[0] }
      : undefined;
  if (r.kind !== "move") return undefined;
  if (r.recharge || r.forcedMoveId !== null) return { kind: "continue" };
  const m = r.moves.find(m => !m.disabled && m.pp > 0);
  return { kind: "move", moveId: m?.moveId ?? "struggle" };
}
export function validateGen4Action(r: Gen4ActionRequest, a: Gen4Action): void {
  if (r.kind === "wait" || r.kind === "ended") throw Error("This side is not being asked to act");
  if (a.kind === "switch") {
    if (!r.switchSlots.includes(a.slotIndex)) throw Error("Cannot switch to this slot");
    return;
  }
  if (r.kind === "switch") throw Error("A replacement is required");
  if (a.kind === "continue") {
    if (!r.recharge && r.forcedMoveId === null) throw Error("No forced continuation");
    return;
  }
  if (a.kind === "move") {
    const id = a.moveId === "struggle" ? 165 : a.moveId;
    if (r.recharge || !r.moves.some(m => m.moveId === id && !m.disabled && m.pp > 0))
      throw Error("This move is unavailable");
    return;
  }
  if (a.kind !== "item" && a.kind !== "wait") throw Error("Unsupported battle action");
  if (r.recharge || r.forcedMoveId !== null) throw Error("A multi-turn action is in progress");
}
export function advanceGen4Battle(
  session: Gen4Session,
  actions: [Gen4Action | undefined, Gen4Action | undefined],
): Gen4Frame {
  const b = restore(session),
    before: [Gen4Party, Gen4Party] = [exportParty(b, b.p1), exportParty(b, b.p2)],
    start = b.log.length;
  if (b.ended) throw Error("Battle already ended");
  // Validate both choices before mutation; a failed choice cannot spend PP or an item.
  for (const index of [0, 1] as const) {
    const a = actions[index];
    if (a) {
      validateGen4Action(request(b, b.sides[index]!), a);
      if (a.kind === "item" && !canUseGen4BagItem(b, b.sides[index]!, a.itemId, a.slotIndex))
        throw Error("The item has no effect on this Pokémon");
    }
  }
  for (const index of [0, 1] as const) {
    const a = actions[index];
    if (!a) continue;
    const side = b.sides[index]!;
    if (a.kind === "item" || a.kind === "wait") {
      if (a.kind === "item" && !canUseGen4BagItem(b, side, a.itemId, a.slotIndex))
        throw Error("The item has no effect on this Pokémon");
      // A real bag action, not a fake Pokémon move. Priority is before attacks, like HGSS's controller.
      const queued = {
        choice: "event",
        event: a.kind === "item" ? "PokeLoungeBag" : "PokeLoungeWait",
        pokemon: side.active[0]!,
        order: 102,
        priority: 0,
        speed: side.active[0]!.speed,
        ...(a.kind === "item" ? { plItemId: a.itemId, plTargetSlot: a.slotIndex } : {}),
      };
      side.choice.actions = [queued as unknown as (typeof side.choice.actions)[number]];
      if (b.sides.every(s => s.isChoiceDone())) b.commitChoices();
    } else {
      const choice =
        a.kind === "continue"
          ? "default"
          : a.kind === "switch"
            ? `switch ${side.pokemon.findIndex(p => slot(p) === a.slotIndex) + 1}`
            : `move ${moveByNum.get(a.moveId === "struggle" ? 165 : a.moveId)!.id}`;
      if (!b.choose(side.id, choice)) throw Error("Battle choice was rejected");
    }
  }
  return frame(b, parseLogs(b, b.log.slice(start), before));
}
export function canUseGen4ItemOnMember(
  itemId: number,
  member: Pick<Gen4Member, "currentHp" | "maxHp" | "status">,
): boolean {
  const item = GEN4_ROM_ITEMS[itemId]?.partyUseEffects;
  if (!item) return false;
  const hp = member.currentHp ?? 0,
    max = member.maxHp ?? 0,
    st = member.status ?? "normal";
  if (item.revive || item.reviveAll) return hp === 0;
  if (hp <= 0) return false;
  return Boolean(
    (item.hpRestore && hp < max) ||
    (item.poisonHeal && (st === "poisoned" || st === "badlyPoisoned")) ||
    (item.burnHeal && st === "burned") ||
    (item.paralysisHeal && st === "paralyzed") ||
    (item.sleepHeal && st === "asleep") ||
    (item.freezeHeal && st === "frozen"),
  );
}
function canUseGen4BagItem(b: Battle, s: Side, itemId: number, targetSlot: number): boolean {
  const p = s.pokemon.find(p => slot(p) === targetSlot);
  return Boolean(
    p && canUseGen4ItemOnMember(itemId, { currentHp: p.hp, maxHp: p.maxhp, status: status(p) }),
  );
}
function applyBagItem(b: Battle, s: Side, itemId: number, targetSlot: number): void {
  const p = s.pokemon.find(p => slot(p) === targetSlot)!;
  const item = GEN4_ROM_ITEMS[itemId]!,
    effects = item.partyUseEffects!;
  b.add("message", `${(p.set as TaggedSet).plMember.name}에게 ${item.name}을 사용했다!`);
  if (effects.revive || effects.reviveAll) {
    p.hp = Number(effects.hpRestoreParam) === 255 ? p.maxhp : Math.max(1, Math.floor(p.maxhp / 2));
    p.fainted = false;
    p.faintQueued = false;
    s.pokemonLeft++;
    p.status = toID("");
    p.statusState = b.initEffectState({ id: "", target: p });
  } else {
    if (effects.hpRestore) {
      const amount = Number(effects.hpRestoreParam);
      p.hp = Math.min(p.maxhp, p.hp + (amount >= 255 ? p.maxhp : amount));
    }
    if (
      (effects.poisonHeal && ["psn", "tox"].includes(p.status)) ||
      (effects.burnHeal && p.status === "brn") ||
      (effects.paralysisHeal && p.status === "par") ||
      (effects.sleepHeal && p.status === "slp") ||
      (effects.freezeHeal && p.status === "frz")
    )
      p.cureStatus();
  }
  b.add("-heal", p, `${p.hp}/${p.maxhp}${p.status ? ` ${p.status}` : ""}`, "[from] item");
}
function parseLogs(b: Battle, logs: readonly string[], before: [Gen4Party, Gen4Party]): Gen4Step[] {
  const state = before.map(p => {
    const m = p.members.find(m => m.slotIndex === p.activeSlotIndex)!;
    return { slot: m.slotIndex, hp: m.currentHp ?? m.maxHp ?? 1, status: m.status ?? "normal" };
  });
  const result: Gen4Step[] = [];
  let move: Gen4Step | undefined;
  let moveIndex = -1;
  const sideOf = (v: string | undefined): 0 | 1 => (v?.startsWith("p2") ? 1 : 0);
  const nameOf = (v: string | undefined): string => {
    const side = sideOf(v);
    const number = Number(v?.match(/slot(\d+)/)?.[1]);
    return (
      before[side].members.find(
        m => m.slotIndex === (Number.isFinite(number) ? number : state[side]!.slot),
      )?.name ?? "포켓몬"
    );
  };
  const push = (
    text: string,
    actor: 0 | 1,
    target: 0 | 1,
    kind: Gen4Step["kind"] = "message",
    moveId = 0,
    damage = 0,
  ): Gen4Step => {
    const step: Gen4Step = {
      text,
      playerSlotIndex: state[0]!.slot,
      opponentSlotIndex: state[1]!.slot,
      actorSide: actor,
      targetSide: target,
      actorSlotIndex: state[actor]!.slot,
      targetSlotIndex: state[target]!.slot,
      playerHp: state[0]!.hp,
      opponentHp: state[1]!.hp,
      playerStatus: state[0]!.status,
      opponentStatus: state[1]!.status,
      kind,
      moveId,
      hit: true,
      damage,
    };
    result.push(step);
    return step;
  };
  const updateMove = () => {
    if (move && moveIndex >= 0) {
      for (const step of result.slice(moveIndex)) {
        step.playerHp = state[0]!.hp;
        step.opponentHp = state[1]!.hp;
        step.playerStatus = state[0]!.status;
        step.opponentStatus = state[1]!.status;
      }
    }
  };
  for (let i = 0; i < logs.length; i++) {
    const line = logs[i]!;
    if (line.startsWith("|split|")) {
      i++;
      continue;
    } // Exact-health format has duplicate public/private lines.
    const [, code, a = "", arg = "", detail = ""] = line.split("|"),
      who = sideOf(a),
      other = who === 0 ? 1 : 0;
    const mon = nameOf(a);
    if (code === "move") {
      updateMove();
      const m = b.dex.moves.get(arg);
      const target = detail ? sideOf(detail) : other;
      moveIndex = result.length;
      move = push(`${mon}의 ${GEN4_ROM_MOVE_NAMES[m.num] ?? "기술"}!`, who, target, "move", m.num);
      continue;
    }
    if (code === "-damage" || code === "-heal") {
      const match = arg.match(/^(\d+)(?:\/(\d+))?(?:\s+(\w+))?/);
      if (!match) continue;
      const referencedSlot = Number(a.match(/slot(\d+)/)?.[1]);
      if (Number.isFinite(referencedSlot) && referencedSlot !== state[who]!.slot) {
        updateMove();
        move = undefined;
        push(code === "-heal" ? `${mon}의 HP가 회복되었다!` : `${mon}에게 추가 데미지!`, who, who);
        continue;
      }
      if (code === "-heal" || line.includes("[from]")) {
        updateMove();
        move = undefined;
      }
      const old = state[who]!.hp;
      state[who]!.hp = +match[1]!;
      state[who]!.status =
        +match[1] === 0 ? "fainted" : (STATUS_FROM_SIM[match[3] ?? ""] ?? "normal");
      if (code === "-damage" && move && !line.includes("[from]")) {
        move.damage += Math.max(0, old - state[who]!.hp);
        updateMove();
      } else {
        updateMove();
        move = undefined;
        push(
          code === "-heal"
            ? `${mon}의 HP가 회복되었다!`
            : `${mon}에게 ${STATUS_KO[detail.replace("[from] ", "")] ?? CONDITION_KO[toID(detail.replace("[from] ", ""))] ?? "추가"} 데미지!`,
          who,
          who,
          "status",
          0,
          Math.max(0, old - state[who]!.hp),
        );
      }
      continue;
    }
    if (code === "-miss" || code === "-immune" || code === "-fail") {
      if (move) move.hit = false;
      push(
        code === "-miss"
          ? "공격이 빗나갔다!"
          : code === "-immune"
            ? "효과가 없다!"
            : "하지만 실패했다!",
        who,
        other,
      );
      continue;
    }
    if (code === "faint") {
      updateMove();
      state[who]!.hp = 0;
      state[who]!.status = "fainted";
      push(`${mon}은 쓰러졌다!`, who, who);
      move = undefined;
      continue;
    }
    if (code === "switch" || code === "drag") {
      updateMove();
      move = undefined;
      const n = Number(a.match(/slot(\d+)/)?.[1]);
      if (Number.isFinite(n)) state[who]!.slot = n;
      const hp = detail.match(/^(\d+)\/(\d+)(?:\s+(\w+))?/);
      if (hp) {
        state[who]!.hp = +hp[1]!;
        state[who]!.status = STATUS_FROM_SIM[hp[3] ?? ""] ?? "normal";
      }
      push(`${nameOf(a)}, 부탁해!`, who, who);
      continue;
    }
    if (code === "-status") {
      state[who]!.status = STATUS_FROM_SIM[arg] ?? "normal";
      updateMove();
      push(`${mon}은 ${STATUS_KO[arg] ?? "상태이상"} 상태가 되었다!`, who, who);
      continue;
    }
    if (code === "-curestatus") {
      const n = Number(a.match(/slot(\d+)/)?.[1]);
      if (Number.isFinite(n) && n !== state[who]!.slot) {
        push(`${mon}의 상태이상이 회복되었다!`, who, who);
        continue;
      }
      state[who]!.status = "normal";
      updateMove();
      push(`${mon}의 상태이상이 회복되었다!`, who, who);
      continue;
    }
    if (code === "cant") {
      updateMove();
      move = undefined;
      push(
        arg === "recharge"
          ? `${mon}은 반동으로 움직일 수 없다!`
          : `${mon}은 ${STATUS_KO[arg] ?? CONDITION_KO[arg] ?? "기술 효과"} 때문에 행동할 수 없다!`,
        who,
        who,
        "status",
      );
      continue;
    }
    if (code === "-prepare") {
      if (move) move.damage = 0;
      push(
        `${mon}은 ${GEN4_ROM_MOVE_NAMES[b.dex.moves.get(arg).num] ?? "공격"}을 준비하고 있다!`,
        who,
        who,
      );
      continue;
    }
    if (code === "-mustrecharge") {
      push(`${mon}은 다음 턴에 쉬어야 한다!`, who, who);
      continue;
    }
    if (code === "-crit") {
      push("급소에 맞았다!", who, who);
      continue;
    }
    if (code === "-supereffective" || code === "-resisted") {
      push(code === "-supereffective" ? "효과가 굉장했다!" : "효과가 별로인 듯하다...", who, who);
      continue;
    }
    if (code === "-boost" || code === "-unboost") {
      const stat: Record<string, string> = {
        atk: "공격",
        def: "방어",
        spa: "특수공격",
        spd: "특수방어",
        spe: "스피드",
        accuracy: "명중률",
        evasion: "회피율",
      };
      push(
        `${mon}의 ${withSubjectParticle(stat[arg] ?? "능력치")} ${code === "-boost" ? "올라갔다!" : "떨어졌다!"}`,
        who,
        who,
      );
      continue;
    }
    if (code === "-weather") {
      move = undefined;
      push(
        `${CONDITION_KO[toID(a)] ?? "날씨"}${detail ? "가 계속되고 있다!" : "로 날씨가 바뀌었다!"}`,
        0,
        1,
      );
      continue;
    }
    if (
      code === "-start" ||
      code === "-end" ||
      code === "-sidestart" ||
      code === "-sideend" ||
      code === "-fieldstart" ||
      code === "-fieldend" ||
      code === "-singleturn"
    ) {
      const cond =
        CONDITION_KO[toID(arg || a)] ??
        GEN4_ROM_MOVE_NAMES[b.dex.moves.get(arg.replace("move: ", "")).num] ??
        "기술 효과";
      push(
        `${mon}: ${cond}${code.includes("end") ? " 효과가 끝났다!" : " 효과가 적용되었다!"}`,
        who,
        who,
      );
      continue;
    }
    if (code === "-ability") {
      push(`${mon}의 특성이 발동했다!`, who, who);
      continue;
    }
    if (code === "-item" || code === "-enditem") {
      const item = b.dex.items.get(arg);
      push(
        `${mon}: ${GEN4_ROM_ITEMS[item.num]?.name ?? "지닌 도구"}${code === "-enditem" ? "를 사용했다!" : "의 효과!"}`,
        who,
        who,
      );
      continue;
    }
    if (code === "-hitcount") {
      push(`${arg}번 맞았다!`, who, who);
      continue;
    }
    if (code === "-nothing") {
      push("그러나 아무 일도 일어나지 않았다!", 0, 1);
      continue;
    }
    if (code === "message" && !a.startsWith("You are using")) push(a, 0, 1);
  }
  updateMove();
  return result;
}

function finishWildEscape(battle: Battle, pokemon: Pokemon): void {
  const cartridge = battle as CartridgeBattle;
  if (!cartridge.plWild) throw Error("Only wild encounters can end with escape");
  cartridge.plEscapeSide = pokemon.side.n as 0 | 1;
  battle.add("message", `${(pokemon.set as TaggedSet).plMember.name}은 전투에서 벗어났다!`);
  battle.win();
}
export function getGen4EscapeInfo(session: Gen4Session, sideIndex: 0 | 1 = 0) {
  const b = restore(session),
    p = b.sides[sideIndex]!.active[0]!;
  return {
    guaranteed: p.hasAbility("runaway") || p.hasItem("smokeball"),
    trapped: Boolean(p.trapped),
  };
}

/** Capture/field persistence must never save Transform, Mimic, stat stages or a temporary ability. */
export function getGen4PokemonOutsideBattle(
  session: Gen4Session,
  sideIndex: 0 | 1,
  slotIndex?: number,
): Gen4Member {
  const battle = restore(session),
    side = battle.sides[sideIndex]!;
  const pokemon =
    slotIndex === undefined ? side.active[0]! : side.pokemon.find(p => slot(p) === slotIndex);
  if (!pokemon) throw Error("Missing persistent party member");
  const input = (pokemon.set as TaggedSet).plMember;
  return {
    ...input,
    currentHp: pokemon.hp,
    maxHp: pokemon.baseMaxhp,
    status: status(pokemon),
    statusTurns: pokemon.status === "slp" ? Math.max(1, Number(pokemon.statusState.time) || 1) : 0,
    heldItemId: pokemon.getItem().num || 0,
    statStages: createDefaultBattleStatStages(),
    moves: pokemon.baseMoveSlots.map(m => ({
      moveId: battle.dex.moves.get(m.id).num,
      pp: m.pp,
      maxPp: m.maxpp,
    })),
  };
}
