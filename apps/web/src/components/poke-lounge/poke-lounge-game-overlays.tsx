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
import styles from "./poke-lounge.module.css";

export type PokeLoungeStateHydrationStatus =
  | "pending"
  | "ready"
  | "local-ready"
  | "conflict"
  | "unavailable";

export function PokeLoungeHydrationScreens({
  copy,
  message,
  status,
  touchGameDevice,
  onRetry,
}: {
  copy: PokeLoungeCopy;
  message: string;
  status: PokeLoungeStateHydrationStatus;
  touchGameDevice: boolean;
  onRetry(): void;
}) {
  if (status === "pending") {
    return (
      <section
        className={styles.loadingOverlay}
        role="status"
        aria-live="polite"
        data-testid="poke-lounge-state-hydration-loading"
      >
        <p className={styles.resultEyebrow}>Poke Lounge</p>
        <p className={styles.resultStatus}>{copy.hydrationLoading}</p>
      </section>
    );
  }
  if (status !== "unavailable") {
    return null;
  }

  return (
    <section
      className={touchGameDevice ? styles.mobileStateScreen : styles.resultOverlay}
      data-testid="poke-lounge-state-hydration-error"
    >
      <p className={styles.resultStatus} aria-live="polite">
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
  touchGameDevice,
  onRetry,
  onLobby,
}: {
  copy: PokeLoungeCopy;
  touchGameDevice: boolean;
  onRetry(): void;
  onLobby(): void;
}) {
  return (
    <section
      className={touchGameDevice ? styles.mobileStateScreen : styles.loadingOverlay}
      role="alert"
      data-testid="poke-lounge-startup-error"
    >
      <p className={styles.resultEyebrow}>Poke Lounge</p>
      <h2 className={styles.startupErrorTitle}>{copy.startup.title}</h2>
      <p className={styles.resultStatus}>{copy.startup.description}</p>
      <div className={styles.resultActions}>
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

export function PokeLoungeStatusRail({
  authenticated,
  autosaveLabel,
  autosaveStatus,
  connectionLabel,
  connectionStatus,
  copy,
  hydrationMessage,
  hydrationRetryDisabled,
  hydrationRetryLabel,
  multiplayer,
  usingLocalHydrationFallback,
  onRetryHydration,
}: {
  authenticated: boolean;
  autosaveLabel: string;
  autosaveStatus: string;
  connectionLabel: string;
  connectionStatus: "offline" | "connecting" | "online";
  copy: PokeLoungeCopy;
  hydrationMessage: string;
  hydrationRetryDisabled: boolean;
  hydrationRetryLabel: string;
  multiplayer: boolean;
  usingLocalHydrationFallback: boolean;
  onRetryHydration(): void;
}) {
  return (
    <aside
      className={styles.statusRail}
      aria-label={copy.statusRailLabel}
      data-poke-lounge-status-rail="true"
    >
      {multiplayer ? (
        <p
          className={styles.statusChip}
          data-tone={connectionStatus === "online" ? "success" : "warning"}
          data-poke-lounge-connection-status={connectionStatus}
        >
          {connectionLabel}
        </p>
      ) : null}
      <p
        className={styles.statusChip}
        data-tone={
          usingLocalHydrationFallback
            ? "warning"
            : autosaveStatus === "error"
              ? "error"
              : "neutral"
        }
        data-poke-lounge-save-status={
          usingLocalHydrationFallback || !authenticated ? "local" : autosaveStatus
        }
      >
        {autosaveLabel}
      </p>
      {usingLocalHydrationFallback ? (
        <div
          className={`${styles.statusChip} ${styles.hydrationFallbackChip}`}
          data-tone="warning"
          role="status"
          data-testid="poke-lounge-state-hydration-local-fallback"
        >
          <span>{hydrationMessage}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={styles.hydrationFallbackRetry}
            onClick={onRetryHydration}
            disabled={hydrationRetryDisabled}
            data-testid="poke-lounge-state-hydration-retry"
          >
            {hydrationRetryLabel}
          </Button>
        </div>
      ) : null}
    </aside>
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
      className={styles.noticeBanner}
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
  requiresAuthentication,
  returnsToRoomEntry,
  score,
  status,
  statusMessage,
  touchGameDevice,
  onLobby,
  onRetry,
  onSubmit,
}: {
  copy: PokeLoungeCopy;
  playTime: number;
  requiresAuthentication: boolean;
  returnsToRoomEntry: boolean;
  score: number;
  status: "idle" | "submitting" | "success" | "auth" | "error";
  statusMessage: string;
  touchGameDevice: boolean;
  onLobby(): void;
  onRetry(): void;
  onSubmit(): void;
}) {
  return (
    <section
      className={touchGameDevice ? styles.mobileResultScreen : styles.resultOverlay}
      data-testid="poke-lounge-result-panel"
    >
      <p className={styles.resultEyebrow}>{copy.resultEyebrow}</p>
      <div className={styles.resultScore} data-testid="poke-lounge-result-score">
        {score}
      </div>
      <p className={styles.resultMeta}>{copy.resultPlayTime(playTime)}</p>
      <p className={styles.resultStatus}>{copy.resultUnranked}</p>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={requiresAuthentication || status === "submitting" || status === "success"}
        data-testid="poke-lounge-result-submit"
      >
        {status === "submitting" ? copy.resultSaving : copy.resultSave}
      </Button>
      <p className={styles.resultStatus} data-testid="poke-lounge-result-status" aria-live="polite">
        {requiresAuthentication ? copy.resultAuthRequired : statusMessage}
      </p>
      <div className={styles.resultActions}>
        <Button type="button" variant="outline" onClick={onRetry} data-testid="poke-lounge-result-retry">
          {returnsToRoomEntry ? copy.resultRoomEntry : copy.resultRetry}
        </Button>
        <Button type="button" variant="outline" onClick={onLobby} data-testid="poke-lounge-result-lobby">
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
  touchGameDevice,
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
  touchGameDevice: boolean;
  onDeferHydration(): void;
  onExitConfirm(): void;
  onExitOpenChange(open: boolean): void;
  onHydrationOpenChange(open: boolean): void;
  onLeaveOpenChange(open: boolean): void;
  onUseLocalHydration(): void;
  onUseServerHydration(): void;
}) {
  const dialogClassName = touchGameDevice ? styles.mobileDecisionSheet : styles.confirmDialog;

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
        <AlertDialogContent
          className={dialogClassName}
          data-poke-lounge-game-exit-dialog="true"
        >
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
        <AlertDialogContent
          className={dialogClassName}
          data-poke-lounge-leave-dialog="true"
        >
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
