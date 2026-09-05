"use client";
import type { CSSProperties } from "react";
import { Backpack, CircleHelp } from "lucide-react";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import type { BattleSpriteRef } from "../runtime/game/battle/battle-types";
import { getMobileUiCopy } from "./mobile-ui-copy";
import { pokemonHealth } from "./mobile-selection-model";
import styles from "./mobile-ui.module.css";

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
      className={styles.pokemonCard}
      disabled={disabled}
      aria-pressed={selected}
      data-poke-lounge-pokemon-card={slotIndex}
      data-poke-lounge-mobile-party-slot={purpose === "party" ? slotIndex : undefined}
      data-poke-lounge-inventory-party-slot={purpose === "inventory" ? slotIndex : undefined}
      data-current={Boolean(badge)}
      data-selected={selected}
      onClick={onSelect}
    >
      <MobilePokemonThumbnail sprite={pokemon.sprite} />
      <span className={styles.pokemonInfo}>
        <span className={styles.cardTitle}>
          <strong>{pokemon.name}</strong>
          <small>Lv.{pokemon.level}</small>
        </span>
        {health ? (
          <>
            <span
              className={styles.hpTrack}
              role="meter"
              aria-label={`${pokemon.name} HP`}
              aria-valuenow={health.current}
              aria-valuemin={0}
              aria-valuemax={health.max}
            >
              <span style={{ width: `${health.ratio * 100}%` }} />
            </span>
            <span className={styles.cardMeta}>
              <span>
                {health.current}/{health.max}
              </span>
              {status ? <span>{status}</span> : null}
            </span>
          </>
        ) : (
          <span className={styles.cardMeta}>{text.missing}</span>
        )}
        {badge || reason || selected ? (
          <span className={styles.cardMeta}>
            {badge ? <span className={styles.badge}>{badge}</span> : null}
            {selected ? <span className={styles.selectedBadge}>✓ {text.selected}</span> : null}
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
      <span className={styles.thumbnail} aria-hidden="true">
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
      className={styles.thumbnail}
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
      className={styles.itemRow}
      disabled={disabled}
      aria-pressed={selected}
      data-selected={selected}
      data-poke-lounge-item-row={id}
      data-poke-lounge-inventory-item={purpose === "inventory" ? id : undefined}
      onClick={onSelect}
    >
      <span className={styles.itemIcon} aria-hidden="true">
        <Backpack size={28} />
      </span>
      <span className={styles.itemInfo}>
        <strong>{name}</strong>
        {description ? <small>{description}</small> : null}
        {reason ? <small>{reason}</small> : null}
      </span>
      <span className={styles.itemCount}>
        {selected ? <span aria-hidden="true">✓ </span> : null}×{count}
      </span>
    </button>
  );
}
