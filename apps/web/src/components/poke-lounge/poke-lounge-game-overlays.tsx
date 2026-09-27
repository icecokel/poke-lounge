import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PokeLoungeCopy } from "./poke-lounge-copy";
import type { PokeLoungeRoomLeaveRequestDetail } from "./runtime/game/ui/poke-lounge-ui-events";

const stateScreenClassName =
  "absolute inset-x-0 top-[var(--poke-lounge-mobile-letterbox-top,0px)] bottom-[var(--poke-lounge-mobile-letterbox-bottom,0px)] z-90 grid content-center justify-items-center gap-3 overflow-auto bg-[#d8e6d4] px-[max(20px,env(safe-area-inset-right,0px))] py-[max(24px,env(safe-area-inset-top,0px))] text-center text-[#17201a]";
const resultEyebrowClassName = "m-0 text-xs font-extrabold uppercase text-[#4a5b4d]";
const resultStatusClassName = "m-0 min-h-5 text-[0.85rem] font-bold text-[#4a5b4d]";
const resultActionsClassName =
  "grid grid-cols-2 gap-2 [&>:first-child:last-child]:col-span-2 [&>:last-child:nth-child(odd)]:col-span-2";
const dialogClassName =
  "!fixed !top-auto !right-auto !bottom-0 !left-1/2 !z-[1100] !w-[min(100vw,480px)] !max-w-[480px] !max-h-[min(72dvh,560px)] !-translate-x-1/2 !translate-y-0 overflow-auto rounded-t-2xl rounded-b-none border-[3px] border-b-0 border-[#304550] bg-[#fffdf0] px-[max(18px,env(safe-area-inset-right,0px))] pt-5 pb-[max(20px,env(safe-area-inset-bottom,0px))] text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1] [&_button]:rounded [&_button]:border-2 [&_button]:border-[#17231c] [&_button]:font-black [&_button]:shadow-[0_3px_0_#17231c]";

export type PokeLoungeStateHydrationStatus =
  "pending" | "ready" | "local-ready" | "conflict" | "unavailable";

export function PokeLoungeHydrationScreens({
  copy,
  message,
  status,
  onRetry,
}: {
  copy: PokeLoungeCopy;
  message: string;
  status: PokeLoungeStateHydrationStatus;
  onRetry(): void;
}) {
  if (status === "pending") {
    return (
      <section
        className={stateScreenClassName}
        role="status"
        aria-live="polite"
        data-testid="poke-lounge-state-hydration-loading"
      >
        <p className={resultEyebrowClassName}>Poke Lounge</p>
        <p className={resultStatusClassName}>{copy.hydrationLoading}</p>
      </section>
    );
  }
  if (status !== "unavailable") return null;

  return (
    <section className={stateScreenClassName} data-testid="poke-lounge-state-hydration-error">
      <p className={resultStatusClassName} aria-live="polite">
        {message}
      </p>
      <Button type="button" onClick={onRetry} data-testid="poke-lounge-state-hydration-retry">
        {copy.hydrationRetry}
      </Button>
    </section>
  );
}

export function PokeLoungeStartupErrorScreen({
  copy,
  onRetry,
  onLobby,
}: {
  copy: PokeLoungeCopy;
  onRetry(): void;
  onLobby(): void;
}) {
  return (
    <section className={stateScreenClassName} role="alert" data-testid="poke-lounge-startup-error">
      <p className={resultEyebrowClassName}>Poke Lounge</p>
      <h2 className="m-0 text-base font-black">{copy.startup.title}</h2>
      <p className={resultStatusClassName}>{copy.startup.description}</p>
      <div className={resultActionsClassName}>
        <Button type="button" onClick={onRetry} data-testid="poke-lounge-startup-retry">
          {copy.startup.retry}
        </Button>
        <Button type="button" variant="outline" onClick={onLobby}>
          {copy.resultLobby}
        </Button>
      </div>
    </section>
  );
}

export function PokeLoungeNoticeBanner({
  copy,
  message,
  tone,
  onClose,
}: {
  copy: PokeLoungeCopy;
  message: string;
  tone: "info" | "success" | "warning" | "error";
  onClose(): void;
}) {
  return (
    <aside
      className="absolute top-[max(14px,env(safe-area-inset-top,0px))] left-1/2 z-70 grid w-[min(440px,calc(100vw-28px))] -translate-x-1/2 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border-[3px] border-[#304550] bg-[#fffdf0] p-2.5 text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1,0_4px_0_#304550] max-[760px]:grid-cols-1 data-[tone=error]:border-[#8f5e53] data-[tone=error]:bg-[#fae0d7] data-[tone=error]:text-[#763b32] [&_p]:m-0 [&_p]:text-[0.78rem] [&_p]:font-extrabold [&_button]:min-h-[34px] [&_button]:border-2 [&_button]:border-[#17231c] [&_button]:font-black [&_button]:shadow-[0_3px_0_#17231c]"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      data-poke-lounge-notice="true"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" onClick={onClose}>
        {copy.noticeConfirm}
      </Button>
    </aside>
  );
}

export function PokeLoungeResultPanel({
  copy,
  playTime,
  returnsToRoomEntry,
  score,
  onLobby,
  onRetry,
}: {
  copy: PokeLoungeCopy;
  playTime: number;
  returnsToRoomEntry: boolean;
  score: number;
  onLobby(): void;
  onRetry(): void;
}) {
  return (
    <section
      className="absolute inset-x-0 top-[var(--poke-lounge-mobile-letterbox-top,0px)] bottom-[var(--poke-lounge-mobile-letterbox-bottom,0px)] z-90 grid content-start justify-items-stretch gap-3 overflow-y-auto rounded-[9px] border-[3px] border-[#4c6977] bg-[#edf3e5] bg-[#edf3e5] [background-image:var(--hg-stripes)] px-[max(20px,env(safe-area-inset-right,0px))] py-[max(24px,env(safe-area-inset-top,0px))] text-center text-[#304550] shadow-[var(--hg-frame)] [&>*]:mx-auto [&>*]:w-[min(100%,520px)] [&_button]:h-auto [&_button]:min-h-12 [&_button]:whitespace-normal [&_button]:rounded-[7px] [&_button]:border-2 [&_button]:border-[#577781] [&_button]:bg-[linear-gradient(#fffdf0_50%,#dce7e2_50%)] [&_button]:p-2.5 [&_button]:text-[#304550] [&_button]:shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#304550] [&_a]:h-auto [&_a]:min-h-12 [&_a]:whitespace-normal [&_a]:rounded-[7px] [&_a]:border-2 [&_a]:border-[#577781] [&_a]:bg-[linear-gradient(#fffdf0_50%,#dce7e2_50%)] [&_a]:p-2.5 [&_a]:text-[#304550] [&_a]:shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#304550]"
      data-poke-lounge-ui="heartgold"
      data-testid="poke-lounge-result-panel"
    >
      <p className="m-0 rounded-md border-2 border-[#7290a0] border-b-[3px] border-b-[#b89a4b] bg-[linear-gradient(#c8e0ec_50%,#edf3ed_50%)] p-2.5 text-lg font-extrabold uppercase text-[#304550] before:mr-2.5 before:text-[#94722a] before:content-['★']">
        {copy.resultEyebrow}
      </p>
      <div
        className="min-h-12 rounded-lg border-[3px] border-[#ae9454] bg-[linear-gradient(#fff3c5_50%,#ebdcad_50%)] p-[18px] text-[2.5rem] font-black leading-none text-[#6a5126] shadow-[inset_0_0_0_2px_#fffdf0]"
        data-testid="poke-lounge-result-score"
      >
        {score}
      </div>
      <p className="m-0 min-h-5 rounded-[5px] border border-[#a9b7a5] bg-[#fffdf0] p-2.5 text-[0.85rem] font-bold text-[#304550]">
        {copy.resultPlayTime(playTime)}
      </p>
      <p className={resultStatusClassName}>{copy.resultUnranked}</p>
      <p className={resultStatusClassName}>{copy.resultStarPrompt}</p>
      <Button asChild>
        <a href="https://github.com/icecokel/poke-lounge" data-testid="poke-lounge-result-github">
          {copy.resultStar}
        </a>
      </Button>
      <div className={resultActionsClassName}>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          data-testid="poke-lounge-result-retry"
        >
          {returnsToRoomEntry ? copy.resultRoomEntry : copy.resultRetry}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onLobby}
          data-testid="poke-lounge-result-lobby"
        >
          {copy.resultLobby}
        </Button>
      </div>
    </section>
  );
}

export function PokeLoungeDecisionDialogs({
  copy,
  exitOpen,
  hydrationConflictOpen,
  leaveRequest,
  onDeferHydration,
  onExitConfirm,
  onExitOpenChange,
  onHydrationOpenChange,
  onLeaveOpenChange,
  onUseLocalHydration,
  onUseServerHydration,
}: {
  copy: PokeLoungeCopy;
  exitOpen: boolean;
  hydrationConflictOpen: boolean;
  leaveRequest: PokeLoungeRoomLeaveRequestDetail | null;
  onDeferHydration(): void;
  onExitConfirm(): void;
  onExitOpenChange(open: boolean): void;
  onHydrationOpenChange(open: boolean): void;
  onLeaveOpenChange(open: boolean): void;
  onUseLocalHydration(): void;
  onUseServerHydration(): void;
}) {
  return (
    <>
      <AlertDialog open={hydrationConflictOpen} onOpenChange={onHydrationOpenChange}>
        <AlertDialogContent
          className={dialogClassName}
          data-testid="poke-lounge-state-hydration-conflict"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.hydrationConflictTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.hydrationConflictDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDeferHydration}>
              {copy.hydrationDecideLater}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={onUseLocalHydration}
              data-testid="poke-lounge-state-hydration-use-local"
            >
              {copy.hydrationUseLocal}
            </Button>
            <Button
              type="button"
              onClick={onUseServerHydration}
              data-testid="poke-lounge-state-hydration-use-server"
            >
              {copy.hydrationUseServer}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={exitOpen} onOpenChange={onExitOpenChange}>
        <AlertDialogContent className={dialogClassName} data-poke-lounge-game-exit-dialog="true">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.exitTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.exitDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.exitContinue}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={onExitConfirm}
              data-poke-lounge-game-exit-confirm="true"
            >
              {copy.exitConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(leaveRequest)} onOpenChange={onLeaveOpenChange}>
        <AlertDialogContent className={dialogClassName} data-poke-lounge-leave-dialog="true">
          <AlertDialogHeader>
            <AlertDialogTitle>{leaveRequest?.title ?? copy.leaveTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {leaveRequest?.description ?? copy.leaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.leaveContinue}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={leaveRequest?.confirm}>
              {copy.leaveConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
