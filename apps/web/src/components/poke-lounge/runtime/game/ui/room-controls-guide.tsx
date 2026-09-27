"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  createShortcutGuideRows,
  createShortcutGuideTitle,
  type ShortcutGuideInputMode,
} from "./shortcut-guide";
import { getRoomControlsCopy } from "./room-controls-copy";

export function RoomControlsGuide({ locale }: { locale: string }) {
  const copy = getRoomControlsCopy(locale);
  const [mode, setMode] = useState<ShortcutGuideInputMode>("keyboard");

  useEffect(function detectInput() {
    if (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches)
      setMode("touch");
  }, []);

  return (
    <section
      className="min-h-0 min-w-0 overflow-auto overscroll-contain px-1 pt-1 pb-2 text-sm leading-6 text-[#1b2e20]"
      id="room-controls-guide"
      data-room-controls-guide="true"
      aria-label={copy.title}
    >
      <p className="mb-2.5 text-[#3f5542]">{copy.description}</p>
      <div className="mb-3 flex gap-2" role="group" aria-label={copy.title}>
        {(["keyboard", "touch"] as const).map(function renderMode(inputMode) {
          const selected = mode === inputMode;
          return (
            <Button
              key={inputMode}
              type="button"
              variant="outline"
              className={cn(
                "min-h-11 rounded-md border-2 border-[#365b3d] bg-white px-4 py-2 font-bold text-[#213c27] shadow-none hover:bg-[#edf4e8] hover:text-[#213c27]",
                selected && "bg-[#365b3d] text-white hover:bg-[#365b3d] hover:text-white",
              )}
              aria-pressed={selected}
              onClick={function selectMode() {
                setMode(inputMode);
              }}
            >
              {copy[inputMode]}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[481px]:grid-cols-2">
        {(["world", "battle"] as const).map(function renderContext(context) {
          return (
            <section
              key={context}
              className="rounded-lg border border-[#a4b59d] bg-[#edf4e8] p-2.5"
            >
              <h3 className="mb-2 text-[15px] font-semibold">
                {createShortcutGuideTitle(context, mode, locale)}
              </h3>
              <dl className="m-0">
                {createShortcutGuideRows(context, mode, locale).map(function renderRow(row) {
                  return (
                    <div key={row.action} className="mb-2 grid gap-0.5">
                      <dt className="font-bold">{row.action}</dt>
                      <dd className="m-0 [overflow-wrap:anywhere]">{row.keys}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
      </div>
      {mode === "touch" ? <p className="mt-2.5 text-[#3f5542]">{copy.touchHint}</p> : null}
    </section>
  );
}
