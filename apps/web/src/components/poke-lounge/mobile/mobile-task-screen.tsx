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
import { resetVirtualGamepad } from "../runtime/game/input/virtual-gamepad";
import styles from "./mobile-ui.module.css";

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
  return createPortal(
    <section
      ref={ref}
      className={`${styles.taskScreen} ${className}`}
      aria-labelledby={titleId}
      data-poke-lounge-mobile-task={name}
      data-poke-lounge-mobile-deck={name}
      data-poke-lounge-mobile-fullscreen-scene="true"
      data-poke-lounge-mobile-settings-screen={name === "settings" ? "true" : undefined}
      onKeyDown={handleKey}
      onKeyUp={event => event.stopPropagation()}
    >
      <header className={styles.taskHeader}>
        {onBack ? (
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            aria-label={backLabel}
            data-poke-lounge-mobile-deck-close="true"
            data-poke-lounge-mobile-settings-close={name === "settings" ? "true" : undefined}
            data-poke-lounge-mobile-battle-help-close={name === "battle-help" ? "true" : undefined}
          >
            <span aria-hidden="true">‹</span>
            <span>{backLabel}</span>
          </button>
        ) : null}
        <h1 id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h1>
      </header>
      {context ? <div className={styles.taskContext}>{context}</div> : null}
      <div className={styles.taskBody} data-poke-lounge-task-body="true">
        {children}
      </div>
      {footer ? (
        <footer className={styles.taskFooter} data-poke-lounge-task-footer="true">
          {footer}
        </footer>
      ) : null}
    </section>,
    target,
  );
}
