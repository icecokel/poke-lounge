"use client";

import { StarterSelectionPanel } from "./starter-selection-panel";
import styles from "./starter-selection-layout.module.css";
import { useRef, useState, type KeyboardEvent } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { StarterPokemon } from "../../types";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { playPokeLoungeSfx, primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import { getStarterSelectionCopy } from "./starter-selection-copy";

export function StarterSelectionScreen({
  copy,
  state,
}: {
  copy: PokeLoungeCopy;
  state: Extract<PokeLoungeRuntimeState, { phase: "starter" }>;
}) {
  const text = getStarterSelectionCopy(copy.locale);
  const starters = state.bootstrap.starters;
  const [selectedId, setSelectedId] = useState(starters[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const selected = starters.find(starter => starter.id === selectedId) ?? starters[0] ?? null;

  const choose = (starter: StarterPokemon) => {
    if (submitted.current) return;
    setSelectedId(starter.id);
    setError("");
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm", { volume: 0.4 });
  };

  const confirm = () => {
    if (!selected || submitted.current) return;
    submitted.current = true;
    setConfirming(true);
    setError("");
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm");
    try {
      // Only explicit confirmation mutates the party. The runtime also guards
      // stale selection requests; do not tear down or recreate the room here.
      state.onSelect(selected);
    } catch {
      submitted.current = false;
      setConfirming(false);
      setError(text.chooseFailed);
    }
  };

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const grid = gridRef.current;
    if (!grid || submitted.current || event.altKey || event.ctrlKey || event.metaKey) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: starters.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = Math.max(0, Math.min(starters.length - 1, next));
    const starter = starters[nextIndex];
    const button = grid.querySelectorAll<HTMLButtonElement>("[data-starter-card]")[nextIndex];
    if (!starter || !button) return;
    choose(starter);
    button.focus({ preventScroll: true });
    // Scroll only the options, never the game page or its fixed footer.
    const option = button.getBoundingClientRect();
    const bounds = grid.getBoundingClientRect();
    if (option.top < bounds.top) grid.scrollTop += option.top - bounds.top - 4;
    else if (option.bottom > bounds.bottom) grid.scrollTop += option.bottom - bounds.bottom + 4;
  };

  return (
    <section className={`${styles.screen} absolute inset-0`} data-screen="starter-selection">
      <StarterSelectionPanel
        copy={copy}
        starters={starters}
        selected={selected}
        confirming={confirming}
        error={error}
        confirmLabel={copy.game.starterConfirm}
        gridRef={gridRef}
        onChoose={choose}
        onConfirm={confirm}
        onNavigate={navigate}
      />
    </section>
  );
}
