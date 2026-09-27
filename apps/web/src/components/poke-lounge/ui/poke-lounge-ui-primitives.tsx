import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const PANEL_CLASS =
  "rounded-[var(--pl-panel-radius)] border-[length:var(--pl-panel-border)] border-[var(--pl-color-ink)] bg-[linear-gradient(180deg,var(--pl-color-surface-raised),var(--pl-color-surface))] text-[var(--pl-color-ink)] shadow-[var(--pl-panel-shadow),inset_0_0_0_2px_rgb(255_255_255_/_58%)]";

const PIXEL_BUTTON_CLASS =
  "h-auto min-w-0 rounded-[4px] border-2 border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-0 py-0 font-black text-[var(--pl-color-ink)] shadow-[0_3px_0_var(--pl-color-ink),inset_0_0_0_1px_rgb(255_255_255_/_72%)] transition-[background,box-shadow,transform] duration-[var(--pl-motion-press)] enabled:hover:bg-[var(--pl-color-gold-soft)] enabled:active:translate-y-[2px] enabled:active:shadow-[0_1px_0_var(--pl-color-ink)] focus-visible:border-[var(--pl-color-ink)] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[var(--pl-color-focus)] focus-visible:outline-offset-2 data-[selected=true]:bg-[var(--pl-color-gold-soft)] data-[selected=true]:shadow-[inset_5px_0_var(--pl-color-johto),0_3px_0_var(--pl-color-ink)] disabled:bg-[var(--pl-color-surface-muted)] disabled:text-[var(--pl-color-ink-muted)] disabled:shadow-none disabled:opacity-[0.68]";

export function PixelPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn(PANEL_CLASS, className)} {...props} />;
}

export function PixelButton({
  className,
  selected = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <Button
      type={type}
      variant="outline"
      className={cn(PIXEL_BUTTON_CLASS, className)}
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
  const valueClass =
    tone === "danger"
      ? "bg-[var(--pl-color-danger)]"
      : tone === "warning"
        ? "bg-[var(--pl-color-warning)]"
        : "bg-[var(--pl-color-hp)]";

  return (
    <span
      {...props}
      className={cn(
        "box-border block h-2 w-full overflow-hidden rounded-[2px] border-2 border-[var(--pl-color-ink)] bg-[var(--pl-color-ink)]",
        className,
      )}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={normalizedValue}
      data-tone={tone}
    >
      <span
        className={cn("block h-full", valueClass)}
        style={{ width: `${normalizedValue * 100}%` }}
      />
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
      className={cn(
        "relative grid min-w-0 grid-cols-[42px_minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] items-center gap-x-1.5 gap-y-px overflow-hidden rounded-[4px] border-2 border-[var(--pl-color-ink)] bg-[linear-gradient(180deg,var(--pl-color-surface-raised),var(--pl-color-surface))] px-[7px] py-[5px] text-left font-[inherit] text-[var(--pl-color-ink)] shadow-[0_3px_0_rgb(36_49_59_/_72%),inset_0_0_0_1px_rgb(255_255_255_/_68%)] transition-[background,transform] duration-[var(--pl-motion-press)] enabled:hover:bg-[var(--pl-color-gold-soft)] enabled:active:translate-y-[2px] focus-visible:outline-3 focus-visible:outline-[var(--pl-color-focus)] focus-visible:outline-offset-2 disabled:cursor-default disabled:text-[var(--pl-color-ink-muted)] disabled:opacity-[0.66] before:absolute before:inset-y-0 before:left-0 before:w-[5px] before:bg-transparent data-[active=true]:before:bg-[var(--pl-color-gold)] data-[selected=true]:bg-[var(--pl-color-gold-soft)] data-[selected=true]:outline-3 data-[selected=true]:outline-[var(--pl-color-johto-deep)] data-[selected=true]:-outline-offset-3",
        className,
      )}
      data-active={active || undefined}
      data-selected={selected || undefined}
      {...props}
    >
      <span className="relative row-span-3 grid size-[42px] place-items-center">
        {sprite ?? "–"}
      </span>
      <strong className="min-w-0 overflow-hidden text-[0.78em] font-black text-ellipsis whitespace-nowrap">
        {name ?? emptyLabel}
      </strong>
      {level !== undefined ? (
        <span className="justify-self-end text-[0.62em] font-black whitespace-nowrap text-[var(--pl-color-ink-muted)]">
          Lv.{level}
        </span>
      ) : null}
      {hp ? (
        <span className="col-[2/-1] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[5px]">
          <HealthBar className="h-1.5" value={hp.ratio} aria-label={`${name ?? emptyLabel} HP`} />
          <small className="text-[0.62em] font-black whitespace-nowrap text-[var(--pl-color-ink-muted)]">
            {hp.current ?? "–"}/{hp.max ?? "–"}
          </small>
        </span>
      ) : null}
      {status && status !== "normal" ? (
        <small className="col-[2/-1] text-[0.62em] font-black whitespace-nowrap text-[var(--pl-color-danger)]">
          {status}
        </small>
      ) : null}
    </button>
  );
}

export function MessageBox({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      type={type}
      variant="outline"
      className={cn(
        "h-auto whitespace-normal rounded-[var(--pl-panel-radius)] border-[length:var(--pl-panel-border)] border-[var(--pl-color-ink)] bg-[linear-gradient(180deg,var(--pl-color-surface-raised),var(--pl-color-surface))] p-0 text-left font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_2px_rgb(255_255_255_/_62%),inset_0_0_0_5px_rgb(138_149_139_/_42%)] hover:bg-[linear-gradient(180deg,var(--pl-color-surface-raised),var(--pl-color-surface))] focus-visible:border-[var(--pl-color-ink)] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[var(--pl-color-focus)] focus-visible:-outline-offset-6",
        className,
      )}
      {...props}
    />
  );
}

export function StatusBadge({
  className,
  tone = "green",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "blue" | "danger" | "gold" | "green";
}) {
  const toneClass =
    tone === "danger"
      ? "border-b-[var(--pl-color-danger)] bg-[#f8d5cd] text-[#7d2b27]"
      : tone === "gold"
        ? "border-b-[var(--pl-color-gold)]"
        : tone === "blue"
          ? "border-b-[var(--pl-color-blue)]"
          : "border-b-[var(--pl-color-johto)]";

  return (
    <div
      className={cn(
        "w-fit rounded-[4px] border-2 border-[var(--pl-color-ink)] bg-[rgb(255_253_240_/_92%)] px-2 py-[5px] font-black leading-[1.1] text-[var(--pl-color-ink)] shadow-[0_3px_0_rgb(36_49_59_/_66%)]",
        toneClass,
        className,
      )}
      data-tone={tone}
      {...props}
    />
  );
}
