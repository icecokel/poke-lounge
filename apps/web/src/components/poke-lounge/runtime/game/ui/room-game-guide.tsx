"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RoomControlsGuide } from "./room-controls-guide";
import { getRoomGameGuideCopy } from "./room-game-guide-copy";

// Percentages keep the spotlight aligned when the preview scales.
const SCENES = [
  { image: "lobby", width: 464, height: 713, area: [3, 88, 94, 7] },
  { image: "starter", width: 280, height: 455, area: [3, 14, 94, 65] },
  { image: "world", width: 480, height: 823, area: [7, 58, 34, 20] },
  { image: "world", width: 480, height: 823, area: [40, 58, 53, 20] },
  { image: "battle", width: 480, height: 823, area: [10, 58, 80, 25] },
  { image: "battle", width: 480, height: 823, area: [3, 84, 94, 14] },
] as const;

const GUIDE_BUTTON =
  "min-h-11 border-2 border-[#627f85] bg-[#fffdf0] font-bold text-[#304e36] shadow-none hover:bg-[#edf4e8] hover:text-[#304e36] focus-visible:ring-[#985512]";

export function RoomGameGuide({
  locale,
  id,
  onClose,
}: {
  locale: string;
  id: string;
  onClose(): void;
}) {
  const copy = getRoomGameGuideCopy(locale);
  const [step, setStep] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const scene = SCENES[step];
  const current = copy.steps[step];
  const last = step === SCENES.length - 1;
  const advance = () => (last ? onClose() : setStep(step + 1));

  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [step]);

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        id={id}
        showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#edf3e5] p-0 text-[#304550] sm:h-auto sm:max-h-[94dvh] sm:w-[calc(100%-1rem)] sm:max-w-[820px] sm:rounded-xl sm:border-[3px] sm:border-[#304550] sm:p-5 sm:shadow-[inset_0_0_0_2px_#fffdf0] motion-reduce:animate-none"
        onCloseAutoFocus={event => {
          event.preventDefault();
          onClose();
        }}
        onKeyDown={event => event.stopPropagation()}
        onKeyUp={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 sm:px-0 sm:pt-0">
          <div>
            <DialogTitle className="text-base font-extrabold sm:text-lg">{copy.title}</DialogTitle>
            <DialogDescription className="mt-2 text-xs leading-5 text-[#56684d]">
              {copy.description}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn(GUIDE_BUTTON, "min-w-11 shrink-0")}
              aria-label={copy.close}
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        <nav
          className="mx-4 my-2 flex shrink-0 gap-1 sm:mx-0 sm:mb-4 sm:gap-2"
          aria-label={copy.title}
        >
          {copy.steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-label={`${index + 1}. ${item.title}`}
              aria-current={index === step ? "step" : undefined}
              onClick={() => setStep(index)}
              className={cn(
                "grid min-h-11 min-w-11 flex-1 place-items-center rounded-md border border-[#a4b59d] font-bold text-[#56684d] transition-colors focus-visible:outline-3 focus-visible:outline-[#985512] motion-reduce:transition-none",
                index === step
                  ? "border-[#315c3e] bg-[#315c3e] text-white"
                  : "bg-[#fffdf0] hover:bg-[#dce7dc]",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </nav>
        <div
          ref={content}
          className="grid min-h-0 min-w-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain px-4 pb-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:items-center sm:px-0"
        >
          <figure className="m-0 grid min-w-0 justify-items-center gap-2">
            <div
              className="relative isolate w-[min(100%,calc(min(50svh,100dvh_-_340px)*var(--guide-ratio)))] overflow-hidden rounded-lg border-2 border-[#304550] bg-[#17201a] sm:w-[min(100%,calc(70svh*var(--guide-ratio)))]"
              style={
                {
                  "--guide-ratio": scene.width / scene.height,
                  aspectRatio: `${scene.width}/${scene.height}`,
                } as CSSProperties
              }
            >
              <Image
                key={scene.image}
                loading="eager"
                src={`/assets/poke-lounge/guide/${scene.image}.webp`}
                alt={copy.preview}
                width={scene.width}
                height={scene.height}
                className="block h-full w-full"
                unoptimized
              />
              <button
                type="button"
                aria-label={`${current.target} · ${last ? copy.done : copy.next}`}
                className="absolute min-h-6 touch-manipulation cursor-pointer rounded-md border-[3px] border-[#ffe583] shadow-[0_0_0_999px_rgba(8,20,15,0.72)] transition-[top,left,width,height] duration-300 hover:border-white focus-visible:border-white focus-visible:outline-4 focus-visible:outline-white after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] motion-reduce:transition-none"
                style={{
                  left: `${scene.area[0]}%`,
                  top: `${scene.area[1]}%`,
                  width: `${scene.area[2]}%`,
                  height: `${scene.area[3]}%`,
                }}
                onClick={advance}
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-3 -left-2 grid size-6 place-items-center rounded-full border-2 border-[#304550] bg-[#ffe583] text-xs font-extrabold text-[#304550]"
                >
                  {step + 1}
                </span>
              </button>
            </div>
            <figcaption className="text-[11px] text-[#56684d]">{copy.preview}</figcaption>
          </figure>
          <div className="min-w-0">
            <div aria-live="polite" aria-atomic="true">
              <p className="mb-1 text-xs font-bold text-[#56684d]">
                {String(step + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
              </p>
              <h2 className="text-lg leading-7 font-extrabold sm:text-xl">{current.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#3f5542]">{current.body}</p>
            </div>

            {last ? (
              <Button
                variant="ghost"
                className="mt-2 w-full min-h-11 text-[#304e36]"
                onClick={() => setStep(0)}
              >
                {copy.replay}
              </Button>
            ) : null}
            <details className="mt-4 border-t border-[#a4b59d] pt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold focus-visible:outline-3 focus-visible:outline-[#985512]">
                {copy.controls}
              </summary>
              <RoomControlsGuide locale={locale} />
            </details>
          </div>
        </div>
        <footer className="flex shrink-0 gap-2 border-t border-[#a4b59d] bg-[#fffdf0] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:mt-3 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0">
          <Button
            variant="outline"
            className={cn(GUIDE_BUTTON, "min-h-12")}
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            {copy.previous}
          </Button>
          <Button
            className={cn(
              GUIDE_BUTTON,
              "min-h-12 flex-1 border-[#304550] bg-[#365b3d] text-white hover:bg-[#315c3e] hover:text-white",
            )}
            onClick={advance}
          >
            {last ? copy.done : copy.next}
            <ChevronRight aria-hidden="true" />
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
