"use client";

import { useState } from "react";
import { PixelButton, PixelPanel } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import {
  getRuntimePokemonSpeciesSummary,
  getRuntimeMoveName,
} from "@/components/poke-lounge/runtime/game/data/game-data-json";
import {
  localizePokemonName,
  localizeMoveName,
} from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueBattleParty, LeagueLocale } from "../contract";
import { getLeagueCopy, leagueText } from "../shell/copy";

export function speciesName(id: number, locale: LeagueLocale): string {
  return localizePokemonName(getRuntimePokemonSpeciesSummary(id)?.name ?? `#${id}`, locale);
}
export function moveName(id: number, locale: LeagueLocale): string {
  return localizeMoveName(getRuntimeMoveName(id), locale);
}
export function PokemonIcon({ speciesId }: { speciesId: number }) {
  const sprite = getBattlePokemonAssets(speciesId).front;
  const columns = sprite.columns ?? 16,
    rows = sprite.rows ?? 16;
  return (
    <span
      aria-hidden="true"
      className="inline-block size-12 shrink-0 bg-no-repeat [image-rendering:pixelated]"
      style={{
        backgroundImage: `url(${sprite.path})`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${((sprite.frame % columns) / (columns - 1)) * 100}% ${(Math.floor(sprite.frame / columns) / (rows - 1)) * 100}%`,
      }}
    />
  );
}
export function LeadPicker({
  locale,
  party,
  opponent,
  opponentName,
  matchLabel,
  onChoose,
  onAbort,
  mode,
}: {
  locale: LeagueLocale;
  party: LeagueBattleParty;
  opponent: LeagueBattleParty;
  opponentName: string;
  matchLabel?: string;
  onChoose(slot: number): void;
  onAbort(): void;
  mode: "badge" | "league";
}) {
  const text = getLeagueCopy(locale);
  const [selected, setSelected] = useState(party.activeSlotIndex);
  const valid = party.members.some(m => m.slotIndex === selected && m.currentHp > 0);
  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-bold">
        {matchLabel} · {opponentName}
      </h2>
      <details className="rounded-lg border p-3" open>
        <summary>{leagueText(locale, "상대 파티", "Opponent party", "相手のパーティ")}</summary>
        <ul className="grid gap-2 sm:grid-cols-2">
          {opponent.members.map(m => (
            <li key={m.slotIndex} className="flex items-center gap-2">
              <PokemonIcon speciesId={m.speciesId} />
              <div>
                {speciesName(m.speciesId, locale)} Lv{m.level}
                <p className="text-sm">
                  {m.moves.map(move => moveName(move.moveId, locale)).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </details>
      <h3 className="font-bold">
        {leagueText(locale, "선두를 선택하세요", "Choose your lead", "先頭を選んでください")}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {party.members.map(m => (
          <PixelButton
            className="justify-start gap-2 p-3 whitespace-normal"
            disabled={m.currentHp <= 0}
            selected={selected === m.slotIndex}
            aria-pressed={selected === m.slotIndex}
            key={m.slotIndex}
            onClick={() => setSelected(m.slotIndex)}
          >
            <PokemonIcon speciesId={m.speciesId} />
            <span>
              {speciesName(m.speciesId, locale)} Lv{m.level}
              <small className="block">
                HP {m.currentHp}/{m.maxHp}
              </small>
            </span>
          </PixelButton>
        ))}
      </div>
      <PixelPanel className="flex flex-wrap gap-3 p-3">
        <PixelButton className="px-4 py-3" disabled={!valid} onClick={() => onChoose(selected)}>
          {text.confirm}
        </PixelButton>
        <PixelButton className="px-4 py-3" onClick={onAbort}>
          {mode === "league"
            ? leagueText(locale, "도전 포기", "Forfeit challenge", "挑戦をあきらめる")
            : text.cancel}
        </PixelButton>
      </PixelPanel>
    </div>
  );
}
