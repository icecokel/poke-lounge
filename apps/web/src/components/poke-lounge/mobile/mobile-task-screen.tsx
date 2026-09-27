"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resetVirtualGamepad } from "../runtime/game/input/virtual-gamepad";

// A task is a navigation surface, not a pretend aria-modal dialog. Only the
// foremost surface owns input; reference-counted restoration handles transitions.
const surfaces: HTMLElement[] = [];
const previousInert = new Map<HTMLElement, boolean>();
function syncSurfaceInput() {
  for (const [node, inert] of previousInert) node.inert = inert;
  previousInert.clear();
  const active = surfaces.at(-1);
  if (!active?.parentElement) return;
  for (const sibling of Array.from(active.parentElement.children)) {
    if (!(sibling instanceof HTMLElement) || sibling === active) continue;
    previousInert.set(sibling, sibling.inert);
    sibling.inert = true;
  }
  active.inert = false;
}

export interface MobileTaskScreenProps {
  title: string;
  name: string;
  children: ReactNode;
  context?: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  backLabel: string;
  returnFocusSelector?: string;
  className?: string;
}

export function MobileTaskScreen({
  title,
  name,
  children,
  context,
  footer,
  onBack,
  backLabel,
  returnFocusSelector,
  className = "",
}: MobileTaskScreenProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setTarget(
      document.querySelector<HTMLElement>("[data-testid='poke-lounge-page']") ?? document.body,
    );
  }, []);
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const owner = node.ownerDocument;
    const previouslyFocused =
      owner.activeElement instanceof HTMLElement ? owner.activeElement : null;
    surfaces.push(node);
    syncSurfaceInput();
    resetVirtualGamepad();
    titleRef.current?.focus({ preventScroll: true });
    const observer = new MutationObserver(syncSurfaceInput);
    observer.observe(node.parentElement!, { childList: true });
    // Safari does not always focus a button on pointer activation. Escape must
    // still belong to the foremost task when document.body retains focus.
    const handleGlobalKey = (event: globalThis.KeyboardEvent) => {
      if (
        surfaces.at(-1) !== node ||
        event.defaultPrevented ||
        owner.querySelector('[role="alertdialog"], [role="dialog"][aria-modal="true"]')
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) backRef.current?.();
      } else if (event.key === "Tab" && !node.contains(owner.activeElement)) {
        event.preventDefault();
        const first = node.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]');
        (first ?? titleRef.current)?.focus({ preventScroll: true });
      }
    };
    owner.defaultView?.addEventListener("keydown", handleGlobalKey, true);
    return () => {
      observer.disconnect();
      owner.defaultView?.removeEventListener("keydown", handleGlobalKey, true);
      const index = surfaces.indexOf(node);
      if (index >= 0) surfaces.splice(index, 1);
      syncSurfaceInput();
      resetVirtualGamepad();
      requestAnimationFrame(() => {
        if (surfaces.length) return;
        const target = returnFocusSelector
          ? owner.querySelector<HTMLElement>(returnFocusSelector)
          : previouslyFocused;
        if (target?.isConnected && !target.closest("[inert]"))
          target.focus({ preventScroll: true });
      });
    };
  }, [returnFocusSelector, target]);

  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    // Prevent the same Enter/Space from also activating the runtime keyboard.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (!event.repeat) backRef.current?.();
    }
  };
  if (!target) return null;
  const taskTone = name.includes("party")
    ? "[--hg-accent:#3f7c59] [--hg-tint:#dcedcc]"
    : name === "battle-bag" || name === "world-inventory-items"
      ? "[--hg-accent:#947138] [--hg-tint:#f4e5b9]"
      : name === "world-pc"
        ? "[--hg-accent:#477c9e] [--hg-tint:#d8edf6]"
        : name === "settings"
          ? "[--hg-accent:#546582] [--hg-tint:#dde5ee]"
          : "";

  return createPortal(
    <section
      ref={ref}
      className={cn(
        "absolute z-[100] flex min-h-0 min-w-0 flex-col overflow-hidden isolate rounded-[10px] border-[3px] border-[var(--hg-ink)] bg-[#edf3e5] [background-image:var(--hg-stripes)] text-base leading-[1.45] text-[var(--hg-ink)] shadow-[var(--hg-frame)] [inset:var(--poke-lounge-mobile-letterbox-top,0px)_env(safe-area-inset-right,0px)_var(--poke-lounge-mobile-letterbox-bottom,0px)_env(safe-area-inset-left,0px)]",
        taskTone,
        className,
      )}
      aria-labelledby={titleId}
      data-poke-lounge-ui="heartgold"
      data-poke-lounge-mobile-task={name}
      data-poke-lounge-mobile-deck={name}
      data-poke-lounge-mobile-fullscreen-scene="true"
      data-poke-lounge-mobile-settings-screen={name === "settings" ? "true" : undefined}
      onKeyDown={handleKey}
      onKeyUp={event => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-3 border-b-[3px] border-[var(--hg-ink)] bg-[linear-gradient(var(--hg-tint)_0_50%,#fffdf0_50%)] px-[max(12px,env(safe-area-inset-left))] py-2 shadow-[inset_0_2px_0_#fffdf0] [&_h1]:min-w-0 [&_h1]:border-l-[5px] [&_h1]:border-l-[var(--hg-accent)] [&_h1]:pl-2.5 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:text-[var(--hg-ink)] [&_h1]:[overflow-wrap:anywhere] [&_h1]:focus:outline-none">
        {onBack ? (
          <Button
            type="button"
            variant="outline"
            className="inline-flex min-h-12 min-w-12 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-[7px] border-2 border-[#304550] bg-[linear-gradient(#fffdf0_50%,#dce7db_50%)] px-3 py-2 font-bold text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#304550] hover:bg-[linear-gradient(#fffdf0_50%,#dce7db_50%)] hover:text-[#304550] focus-visible:border-[#304550] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 active:translate-y-px active:shadow-[inset_0_0_0_2px_#fffdf0] [&>span:first-child]:text-2xl [&>span:first-child]:leading-none"
            onClick={onBack}
            aria-label={backLabel}
            data-poke-lounge-mobile-deck-close="true"
            data-poke-lounge-mobile-settings-close={name === "settings" ? "true" : undefined}
            data-poke-lounge-mobile-battle-help-close={name === "battle-help" ? "true" : undefined}
          >
            <span aria-hidden="true">‹</span>
            <span>{backLabel}</span>
          </Button>
        ) : null}
        <h1 id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h1>
      </header>
      {context ? (
        <div className="shrink-0 border-b-2 border-[var(--hg-line)] bg-[var(--hg-paper)] px-4 py-2 text-sm tabular-nums">
          {context}
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[max(16px,env(safe-area-inset-left))] py-3 [scroll-padding-block:12px] [&>*+*]:mt-3"
        data-poke-lounge-task-body="true"
      >
        {children}
      </div>
      {footer ? (
        <footer
          className="grid shrink-0 gap-2 border-t-[3px] border-[var(--hg-ink)] bg-[var(--hg-paper)] px-[max(16px,env(safe-area-inset-left))] py-3 shadow-[inset_0_3px_0_var(--hg-tint)]"
          data-poke-lounge-task-footer="true"
        >
          {footer}
        </footer>
      ) : null}
    </section>,
    target,
  );
}
