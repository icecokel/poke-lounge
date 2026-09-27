"use client";
import type { CSSProperties } from "react";
import { CircleHelp } from "lucide-react";
import { HgssItemIcon } from "../ui/hgss-item-icon";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import type { BattleSpriteRef } from "../runtime/game/battle/battle-types";
import { getMobileUiCopy } from "./mobile-ui-copy";
import { pokemonHealth } from "./mobile-selection-model";

interface PokemonCardProps {
  copy: PokeLoungeCopy;
  pokemon: {
    name: string;
    level: number;
    currentHp: number | null;
    maxHp: number | null;
    status: string | null;
    sprite?: BattleSpriteRef | null;
  };
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  reason?: string;
  onSelect(): void;
  slotIndex: number;
  purpose?: "battle" | "party" | "inventory";
}

export function MobilePokemonCard({
  copy,
  pokemon,
  selected = false,
  disabled = false,
  badge,
  reason,
  onSelect,
  slotIndex,
  purpose = "battle",
}: PokemonCardProps) {
  const text = getMobileUiCopy(copy.locale);
  const health = pokemonHealth(pokemon.currentHp, pokemon.maxHp);
  const status =
    pokemon.status && pokemon.status !== "normal"
      ? (copy.game.statusLabel[pokemon.status as keyof typeof copy.game.statusLabel] ??
        pokemon.status)
      : null;
  return (
    <button
      type="button"
      className="group/pokemon relative flex min-h-24 w-full min-w-0 touch-manipulation items-center gap-3 rounded-[10px_22px_10px_22px] border-[3px] border-[#4c747a] bg-[linear-gradient(#f8fdef_0_49%,#e0eddf_49%)] px-3.5 py-3 text-left leading-[1.4] text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,0_3px_0_#4c747a] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 data-[current=true]:border-[#83672c] data-[current=true]:bg-[linear-gradient(#fff5cc_49%,#eee3b9_49%)] data-[selected=true]:border-[#b16c2e] data-[selected=true]:bg-[linear-gradient(#fff4d0_49%,#f1dba6_49%)] data-[selected=true]:shadow-[inset_0_0_0_2px_#fffdf0,inset_7px_0_0_#e6a447,0_3px_0_#775b38] data-[fainted=true]:border-[#9b6f69] data-[fainted=true]:bg-[linear-gradient(#f5e6df_49%,#e8d4cd_49%)] disabled:cursor-default disabled:border-solid disabled:bg-[linear-gradient(#e8eddf_49%,#d8dfd2_49%)] disabled:text-[#526165] disabled:opacity-100 data-[current=true]:disabled:bg-[linear-gradient(#fff5cc_49%,#eee3b9_49%)]"
      disabled={disabled}
      aria-pressed={selected}
      data-poke-lounge-pokemon-card={slotIndex}
      data-poke-lounge-mobile-party-slot={purpose === "party" ? slotIndex : undefined}
      data-poke-lounge-inventory-party-slot={purpose === "inventory" ? slotIndex : undefined}
      data-current={Boolean(badge)}
      data-health={
        health
          ? health.ratio < 0.25
            ? "danger"
            : health.ratio < 0.5
              ? "warning"
              : "healthy"
          : undefined
      }
      data-fainted={pokemon.status === "fainted" || pokemon.currentHp === 0 || undefined}
      data-selected={selected}
      onClick={onSelect}
    >
      <MobilePokemonThumbnail sprite={pokemon.sprite} />
      <span className="grid min-w-0 flex-1 gap-[5px]">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 [&_strong]:text-base [&_strong]:[overflow-wrap:anywhere] [&_small]:text-sm [&_small]:leading-[1.4]">
          <strong>{pokemon.name}</strong>
          <small>Lv.{pokemon.level}</small>
        </span>
        {health ? (
          <>
            <span
              className="block h-2.5 overflow-hidden rounded-[3px] border-2 border-[#44575a] bg-[#c4ccc0] [&>span]:block [&>span]:h-full [&>span]:bg-[linear-gradient(#78d59c_50%,#399267_50%)] group-data-[health=warning]/pokemon:[&>span]:bg-[linear-gradient(#f3d872_50%,#b38e30_50%)] group-data-[health=danger]/pokemon:[&>span]:bg-[linear-gradient(#eb9986_50%,#bf564c_50%)]"
              role="meter"
              aria-label={`${pokemon.name} HP`}
              aria-valuenow={health.current}
              aria-valuemin={0}
              aria-valuemax={health.max}
            >
              <span style={{ width: `${health.ratio * 100}%` }} />
            </span>
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm leading-[1.4]">
              <span>
                {health.current}/{health.max}
              </span>
              {status ? <span>{status}</span> : null}
            </span>
          </>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm leading-[1.4]">
            {text.missing}
          </span>
        )}
        {badge || reason || selected ? (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm leading-[1.4]">
            {badge ? (
              <span className="inline-block rounded border border-[#819879] px-1.5 py-0.5 text-xs font-bold">
                {badge}
              </span>
            ) : null}
            {selected ? (
              <span className="inline-block rounded border border-[#315a3b] bg-[#315a3b] px-1.5 py-0.5 text-xs font-bold text-white">
                ✓ {text.selected}
              </span>
            ) : null}
            {reason && reason !== badge && reason !== status ? <span>{reason}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function MobilePokemonThumbnail({ sprite }: { sprite?: BattleSpriteRef | null }) {
  if (!sprite)
    return (
      <span
        className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[#98b7a5] bg-[#f7f8e6] bg-no-repeat shadow-[0_2px_0_#668576] [image-rendering:pixelated]"
        aria-hidden="true"
      >
        <CircleHelp size={32} />
      </span>
    );
  const columns = sprite.columns ?? 16;
  const rows = sprite.rows ?? 16;
  const style: CSSProperties = {
    backgroundImage: `url(${sprite.path})`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns <= 1 ? 0 : ((sprite.frame % columns) / (columns - 1)) * 100}% ${rows <= 1 ? 0 : (Math.floor(sprite.frame / columns) / (rows - 1)) * 100}%`,
  };
  return (
    <span
      className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[#98b7a5] bg-[#f7f8e6] bg-no-repeat shadow-[0_2px_0_#668576] [image-rendering:pixelated]"
      style={style}
      aria-hidden="true"
      data-poke-lounge-pokemon-thumbnail="true"
    />
  );
}

export function MobileItemRow({
  name,
  count,
  description,
  selected = false,
  disabled = false,
  reason,
  id,
  onSelect,
  purpose = "battle",
}: {
  name: string;
  count: number;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  reason?: string;
  id: string;
  onSelect(): void;
  purpose?: "battle" | "inventory";
}) {
  return (
    <button
      type="button"
      className="flex min-h-[72px] w-full min-w-0 touch-manipulation items-center gap-3 rounded-[7px] border-2 border-[#9b8d6c] bg-[linear-gradient(#fffdf0_50%,#f3ecd4_50%)] p-3 text-left leading-[1.4] text-[#17231c] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#a1997f] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 data-[selected=true]:border-[#b27330] data-[selected=true]:bg-[#fff1bf] data-[selected=true]:shadow-[inset_5px_0_0_#e9ab48,inset_0_0_0_2px_#fffdf0] disabled:cursor-default disabled:border-dashed disabled:bg-[#e3e6da] disabled:text-[#536164] disabled:opacity-100"
      disabled={disabled}
      aria-pressed={selected}
      data-selected={selected}
      data-poke-lounge-item-row={id}
      data-poke-lounge-inventory-item={purpose === "inventory" ? id : undefined}
      onClick={onSelect}
    >
      <HgssItemIcon id={id} />
      <span className="grid min-w-0 flex-1 gap-[5px] [&_strong]:text-base [&_strong]:[overflow-wrap:anywhere] [&_small]:text-sm [&_small]:leading-[1.4] [&_small]:whitespace-normal [&_small]:[overflow-wrap:anywhere]">
        <strong>{name}</strong>
        {description ? <small>{description}</small> : null}
        {reason ? <small>{reason}</small> : null}
      </span>
      <span className="shrink-0 rounded-[5px] border border-[#b6aa84] bg-[#fffdf0] px-[7px] py-1 text-sm font-bold tabular-nums text-[#604e33]">
        {selected ? <span aria-hidden="true">✓ </span> : null}×{count}
      </span>
    </button>
  );
}
