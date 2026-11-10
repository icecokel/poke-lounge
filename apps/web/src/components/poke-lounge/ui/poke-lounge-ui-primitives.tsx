import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

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
