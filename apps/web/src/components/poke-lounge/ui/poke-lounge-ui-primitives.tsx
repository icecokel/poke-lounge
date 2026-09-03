import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./poke-lounge-ui-primitives.module.css";

export function PixelPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn(styles.pixelPanel, className)} {...props} />;
}

export function PixelButton({
  className,
  selected = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      className={cn(styles.pixelButton, className)}
      data-selected={selected || undefined}
      {...props}
    />
  );
}

export function HealthBar({
  className,
  value,
  ...props
}: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & { value: number }) {
  const normalizedValue = Math.min(1, Math.max(0, value));
  const tone = normalizedValue < 0.25 ? "danger" : normalizedValue < 0.5 ? "warning" : "healthy";

  return (
    <span
      {...props}
      className={cn(styles.healthBar, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={normalizedValue}
      data-tone={tone}
    >
      <span className={styles.healthBarValue} style={{ width: `${normalizedValue * 100}%` }} />
    </span>
  );
}

export function PokemonSlot({
  active = false,
  className,
  emptyLabel,
  hp,
  level,
  name,
  selected = false,
  sprite,
  status,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  active?: boolean;
  emptyLabel: string;
  hp?: { current: number | null; max: number | null; ratio: number };
  level?: number;
  name?: string | null;
  selected?: boolean;
  sprite?: ReactNode;
  status?: string | null;
}) {
  return (
    <button
      type={type}
      className={cn(styles.pokemonSlot, className)}
      data-active={active || undefined}
      data-selected={selected || undefined}
      {...props}
    >
      <span className={styles.pokemonSlotSprite}>{sprite ?? "–"}</span>
      <strong className={styles.pokemonSlotName}>{name ?? emptyLabel}</strong>
      {level !== undefined ? <span className={styles.pokemonSlotLevel}>Lv.{level}</span> : null}
      {hp ? (
        <span className={styles.pokemonSlotHealth}>
          <HealthBar value={hp.ratio} aria-label={`${name ?? emptyLabel} HP`} />
          <small className={styles.pokemonSlotHpText}>
            {hp.current ?? "–"}/{hp.max ?? "–"}
          </small>
        </span>
      ) : null}
      {status && status !== "normal" ? (
        <small className={styles.pokemonSlotStatus}>{status}</small>
      ) : null}
    </button>
  );
}

export function MessageBox({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(styles.messageBox, className)} {...props} />;
}

export function StatusBadge({
  className,
  tone = "green",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "blue" | "danger" | "gold" | "green";
}) {
  return <div className={cn(styles.statusBadge, className)} data-tone={tone} {...props} />;
}
