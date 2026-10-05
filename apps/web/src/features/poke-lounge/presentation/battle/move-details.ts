import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";
import type { MobileBattleMoveOption } from "../../contracts/battle-controls";
import moveEffects from "./gen4-move-effects.json";

// Gen4 short descriptions are sourced from the installed @pkmn/sim move catalog.

const EFFECTS: Record<number, readonly [string, string, string]> = {
  4: ["화상", "May burn", "やけど"],
  6: ["마비", "May paralyze", "まひ"],
  18: ["상대 공격 감소", "Lowers target's Attack", "相手の攻撃を下げる"],
  19: ["상대 방어 감소", "Lowers target's Defense", "相手の防御を下げる"],
  20: ["상대 스피드 감소", "Lowers target's Speed", "相手の素早さを下げる"],
  23: ["상대 명중률 감소", "Lowers target's accuracy", "相手の命中率を下げる"],
  41: ["40 고정 데미지", "Fixed 40 damage", "40の固定ダメージ"],
  60: ["상대 스피드 크게 감소", "Sharply lowers target's Speed", "相手の素早さを大きく下げる"],
  66: ["독", "Poisons target", "相手をどくにする"],
  67: ["마비", "Paralyzes target", "相手をまひにする"],
  103: ["우선 행동", "Moves first", "先に行動する"],
  130: ["20 고정 데미지", "Fixed 20 damage", "20の固定ダメージ"],
  156: ["자신의 방어 증가", "Raises own Defense", "自分の防御を上げる"],
};

export function getBattleMoveDetails(
  move: MobileBattleMoveOption,
  locale: PokeLoungeLocale,
): { stats: string; effect: string } {
  const language = locale === "en-US" ? 1 : locale === "ja-JP" ? 2 : 0;
  const labels = {
    power: ["위력", "Power", "威力"],
    accuracy: ["명중률", "Accuracy", "命中"],
    effect: ["효과", "Effect", "効果"],
    physical: ["물리 공격", "Physical attack", "物理攻撃"],
    special: ["특수 공격", "Special attack", "特殊攻撃"],
    status: ["변화 기술", "Status move", "変化技"],
  } as const;
  const knownEffect = EFFECTS[move.effectCode]?.[language];
  const catalogEffect = (moveEffects as Record<string, string>)[String(move.id)];
  const fallback = labels[move.category][language];
  const chance =
    move.effectChance > 0 && (move.effectCode === 4 || move.effectCode === 6)
      ? ` ${move.effectChance}%`
      : "";

  return {
    stats: `${labels.power[language]} ${move.power > 0 ? move.power : "—"} · ${labels.accuracy[language]} ${move.accuracy > 0 ? `${move.accuracy}%` : "—"}`,
    effect: `${labels.effect[language]}: ${language === 1 ? catalogEffect || knownEffect || fallback : (knownEffect ?? catalogEffect ?? fallback)}${knownEffect && language !== 1 ? chance : ""}`,
  };
}
