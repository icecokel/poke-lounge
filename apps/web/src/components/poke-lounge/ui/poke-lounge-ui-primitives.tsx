import type { ButtonHTMLAttributes, HTMLAttributes, MeterHTMLAttributes, ReactNode } from "react";
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
}: Omit<MeterHTMLAttributes<HTMLMeterElement>, "max" | "min" | "optimum">) {
  return (
    <meter
      className={cn(styles.healthBar, className)}
      min={0}
      max={1}
      low={0.25}
      high={0.5}
      optimum={1}
      value={value}
      {...props}
    />
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
