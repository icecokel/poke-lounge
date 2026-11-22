"use client";

import { useEffect, useRef, useState } from "react";
import { BattleScreen } from "@/components/poke-lounge/runtime/game/battle/battle-screen";
import { createBattleUiStore } from "@/components/poke-lounge/runtime/game/battle/battle-ui-store";
import { RuntimeKeyboard } from "@/components/poke-lounge/runtime/game/runtime-input";
import { MobileBattleDeck } from "@/components/poke-lounge/mobile/mobile-battle-deck";
import { getPokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";
import { Button } from "@/components/ui/button";
import type { LeagueJudgedBattleProps } from "../contract";
import { LeadPicker } from "./lead-picker";
import { createJudgedBattleController } from "./judged-battle-controller";
import { getLeagueCopy, leagueText } from "../shell/copy";

export function LeagueJudgedBattle(props: LeagueJudgedBattleProps) {
  const { runtime, init, opponent, matchLabel, mode } = props;
  const [selection, setSelection] = useState<{
    leadSlot: number;
    init: LeagueJudgedBattleProps["init"];
    opponentName: string;
  } | null>(null);
  const [error, setError] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [store] = useState(createBattleUiStore);
  const battleRoot = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const copy = getPokeLoungeCopy(runtime.locale);
  const text = getLeagueCopy(runtime.locale);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!selection || !battleRoot.current) return;
    // The page header and notices sit above the battle; bring the battle itself into view.
    battleRoot.current.scrollIntoView({ block: "start" });
    const keyboard = new RuntimeKeyboard(battleRoot.current);
    let frame = 0;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    let controller: ReturnType<typeof createJudgedBattleController> | undefined;
    try {
      controller = createJudgedBattleController({
        init: { ...selection.init, leadSlot: selection.leadSlot },
        store,
        opponentName: selection.opponentName,
        onFinished: result => callbacks.current.onFinished(result),
        onError: () => setError(true),
      });
      const update = () => {
        controller?.updateKeyboard(
          keyboard,
          Boolean(
            battleRoot.current?.querySelector("[data-poke-lounge-command-layout='heartgold']"),
          ),
        );
        keyboard.clearPresses();
        frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    } catch {
      setError(true);
    }
    return () => {
      cancelAnimationFrame(frame);
      keyboard.destroy();
      controller?.dispose();
      window.removeEventListener("beforeunload", warn);
    };
  }, [selection, store]);
  if (error)
    return (
      <div role="alert" className="grid gap-3">
        <p>
          {leagueText(
            runtime.locale,
            "입력을 처리하지 못했습니다. 경기를 처음부터 다시 시작해 주세요.",
            "Could not process the input. Restart this match.",
            "入力を処理できませんでした。試合を最初から再開してください。",
          )}
        </p>
        <Button
          onClick={() => {
            setError(false);
            setSelection(null);
          }}
        >
          {text.retry}
        </Button>
      </div>
    );
  if (!selection)
    return (
      <LeadPicker
        locale={runtime.locale}
        party={init.challenger}
        opponent={init.opponent}
        opponentName={opponent.displayName}
        opponentClassName={opponent.className}
        matchLabel={matchLabel}
        onChoose={leadSlot => setSelection({ leadSlot, init, opponentName: opponent.displayName })}
        onAbort={() => callbacks.current.onAbort()}
        mode={mode}
      />
    );
  return (
    <div ref={battleRoot} tabIndex={-1} className="poke-lounge-runtime grid gap-3">
      <h2 className="font-bold">
        {matchLabel} · {opponent.className && `${opponent.className} `}
        {opponent.displayName}
      </h2>
      {/* The battle scrolls to the top when it starts; the 4:3 frame is capped by the height left
          under its title, so a short landscape screen sees the whole battle and its panel. */}
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[max(280px,calc((100dvh-3.5rem)*4/3))] overflow-hidden rounded-lg">
        <BattleScreen copy={copy} desktop={desktop} uiStore={store} moveDescriptions />
      </div>
      {!desktop && <MobileBattleDeck copy={copy} uiStore={store} moveDescriptions />}
    </div>
  );
}
