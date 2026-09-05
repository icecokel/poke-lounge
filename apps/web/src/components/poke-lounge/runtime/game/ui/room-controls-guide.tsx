"use client";
import { useEffect, useState } from "react";
import {
  createShortcutGuideRows,
  createShortcutGuideTitle,
  type ShortcutGuideInputMode,
} from "./shortcut-guide";
import { getRoomControlsCopy } from "./room-controls-copy";
import styles from "./room-controls-guide.module.css";
export function RoomControlsGuide({ locale }: { locale: string }) {
  const copy = getRoomControlsCopy(locale);
  const [mode, setMode] = useState<ShortcutGuideInputMode>("keyboard");
  useEffect(function detectInput() {
    if (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches)
      setMode("touch");
  }, []);
  return (
    <section
      className={styles.guide}
      id="room-controls-guide"
      data-room-controls-guide="true"
      aria-label={copy.title}
    >
      <p className={styles.description}>{copy.description}</p>
      <div className={styles.modes} role="group" aria-label={copy.title}>
        {(["keyboard", "touch"] as const).map(function renderMode(inputMode) {
          return (
            <button
              key={inputMode}
              type="button"
              aria-pressed={mode === inputMode}
              onClick={function selectMode() {
                setMode(inputMode);
              }}
            >
              {copy[inputMode]}
            </button>
          );
        })}
      </div>
      <div className={styles.sections}>
        {(["world", "battle"] as const).map(function renderContext(context) {
          return (
            <section key={context}>
              <h3>{createShortcutGuideTitle(context, mode, locale)}</h3>
              <dl>
                {createShortcutGuideRows(context, mode, locale).map(function renderRow(row) {
                  return (
                    <div key={row.action}>
                      <dt>{row.action}</dt>
                      <dd>{row.keys}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
      </div>
      {mode === "touch" ? <p className={styles.description}>{copy.touchHint}</p> : null}
    </section>
  );
}
