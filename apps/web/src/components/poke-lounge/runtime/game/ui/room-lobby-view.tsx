"use client";

import {
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crown,
  Link2,
  Menu,
  UserRound,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import {
  DEFAULT_AI_DIFFICULTY,
  nextAiDifficulty,
  type AiDifficulty,
} from "@poke-lounge/battle/ai-difficulty";
import { cn } from "@/lib/utils";
import { useEffect, useId, useRef, useState } from "react";
import { getPokeLoungeCopyForUrl } from "../../../poke-lounge-copy";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { localizeTrainerName } from "../i18n/runtime-game-localization";
import { resetVirtualGamepad } from "../input/virtual-gamepad";
import type {
  TournamentRoomParticipant,
  TournamentStateRoomPayload,
} from "../network/tournament-projection";
import { RoomGameGuide } from "./room-game-guide";
import { getRoomLobbyCopy } from "./room-lobby-copy";
import { createRoomLobbyViewState } from "./room-lobby-screen";
import { useRoomLobbyCommands } from "./use-room-lobby-commands";

const SECONDARY_BUTTON =
  "inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-[7px] border-2 border-[#627f85] bg-[linear-gradient(#fffdf0_50%,#dfe9df_50%)] px-2.5 py-2 font-bold text-[#304e36] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536b73] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]";

const PRIMARY_BUTTON =
  "inline-flex min-h-12 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-lg border-2 border-[#304550] bg-[linear-gradient(#638f62_50%,#386747_50%)] px-2.5 py-2 font-bold text-white shadow-[var(--hg-button)] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]";

export function RoomLobbyScreen({
  roomShareAvailable,
  roomShareLabel,
  state,
  onRoomShare,
  onOpenSettings,
}: {
  roomShareAvailable: boolean;
  roomShareLabel: string;
  state: Extract<PokeLoungeRuntimeState, { phase: "lobby" }>;
  onRoomShare(): void;
  onOpenSettings?: () => void;
}) {
  const fullCopy = getPokeLoungeCopyForUrl(
    new URL(typeof window === "undefined" ? "http://localhost/ko-KR" : window.location.href),
  );
  const copy = fullCopy.lobby;
  const text = getRoomLobbyCopy(fullCopy.locale);
  const titleId = useId();
  const infoId = useId();
  const statusId = useId();
  const [showInfo, setShowInfo] = useState(false);
  const { mutation, failed, runMutation } = useRoomLobbyCommands();
  const errorMessage = failed ? copy.mutationFailed : "";
  const heading = useRef<HTMLHeadingElement>(null);
  const infoButton = useRef<HTMLButtonElement>(null);
  const view = createRoomLobbyViewState(state.projection, mutation);
  const participants = state.projection.participants.filter(p => p.role === "participant");
  const readyCount = participants.filter(p => p.connected && p.ready).length;
  const own = participants.find(p => p.playerId === state.projection.ownPlayerId);
  const seconds = Math.max(0, Math.floor(state.projection.roomRound.durationMs / 1000));
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    resetVirtualGamepad();
    heading.current?.focus({ preventScroll: true });
    return () => {
      resetVirtualGamepad();
    };
  }, []);

  const status = mutation
    ? mutation === "start"
      ? text.startPending
      : mutation === "ready"
        ? text.readyPending
        : text.aiPending
    : !own
      ? text.spectatorHint
      : !own.connected
        ? copy.startDisabledReason.connection
        : !own.ready
          ? text.ownNotReady
          : view.isHost
            ? view.startDisabledReason
              ? copy.startDisabledReason[view.startDisabledReason]
              : copy.hostReady
            : copy.guestWaiting;
  const shareText = roomShareLabel === fullCopy.settingsShare ? text.invite : roomShareLabel;
  const closeInfo = () => {
    setShowInfo(false);
    infoButton.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!showInfo) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        document.querySelector("[data-poke-lounge-mobile-task], [role='dialog']")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setShowInfo(false);
      infoButton.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [showInfo]);

  return (
    <section
      className="absolute inset-0 grid min-h-0 min-w-0 place-items-stretch overflow-hidden bg-[#edf3e5] [background-image:var(--hg-stripes)] p-2 text-base leading-[1.45] text-[var(--hg-ink)]"
      data-room-lobby="true"
      data-room-lobby-info-open={showInfo ? "true" : undefined}
      aria-labelledby={titleId}
      onKeyDown={event => {
        // Native buttons own their keys; never send Enter/Space to the game too.
        event.stopPropagation();
        if (event.key === "Escape" && showInfo) {
          event.preventDefault();
          closeInfo();
        }
      }}
      onKeyUp={event => event.stopPropagation()}
    >
      <div className="grid h-full min-h-0 min-w-0 w-full grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-[10px] border-[3px] border-[#304550] bg-[#edf3e5] shadow-[inset_0_0_0_2px_#fffdf0,0_4px_0_#304550]">
        <header className="flex items-center gap-[9px] bg-[linear-gradient(#c0dce7_50%,#e2edf0_50%)] px-3 pt-2 pb-[5px] shadow-[inset_0_2px_0_#fffdf0]">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-[#4e7484] bg-[#fffdf0] text-[#467e9b] shadow-[inset_0_0_0_2px_#d5e5e6]"
            aria-hidden="true"
          >
            <Users size={26} />
          </span>
          <div className="min-w-0 flex-1 [&_h1]:text-lg [&_h1]:leading-[1.3] [&_h1]:font-extrabold [&_h1]:text-[#304550] [&_h1]:[overflow-wrap:anywhere] [&_h1]:focus:outline-none">
            <p className="hidden text-[0.6875rem] font-extrabold tracking-[0.13em] text-[#54705b]">
              POKE LOUNGE
            </p>
            <h1 ref={heading} tabIndex={-1} id={titleId}>
              {copy.title}
            </h1>
          </div>
          {onOpenSettings ? (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-[7px] border-2 border-[#627f85] bg-[linear-gradient(#fffdf0_50%,#dfe9df_50%)] px-2.5 py-2 font-bold text-[#304e36] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536b73] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
              onClick={onOpenSettings}
              aria-label={fullCopy.settingsOpenLabel}
              data-poke-lounge-mobile-menu="true"
            >
              <Menu size={24} />
            </button>
          ) : null}
        </header>
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-b-[3px] border-[#526e7a] bg-[#e2edf0] px-3 pb-2 text-[0.8125rem] text-[#50624c]">
          <span className="flex min-w-0 items-baseline gap-2 [&_strong]:rounded [&_strong]:border [&_strong]:border-[#8299a0] [&_strong]:bg-[#fffdf0] [&_strong]:px-1.5 [&_strong]:py-px [&_strong]:font-mono [&_strong]:text-[0.9375rem] [&_strong]:text-[#273a2d] [&_strong]:[overflow-wrap:anywhere]">
            <span>{state.privateRoomAccessCode ? text.privateCode : text.room}</span>
            <strong data-room-lobby-code>
              {state.privateRoomAccessCode ?? state.projection.roomCode}
            </strong>
          </span>
          <span
            className="flex items-center gap-[5px] [&_b]:whitespace-nowrap [&_b]:text-[#273a2d] [&_b]:tabular-nums"
            data-room-lobby-duration
          >
            <Clock3 size={16} aria-hidden="true" />
            <span>
              {text.duration} <b>{duration}</b>
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {roomShareAvailable ? (
            <button
              type="button"
              className="flex-1 inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-[7px] border-2 border-[#627f85] bg-[linear-gradient(#fffdf0_50%,#dfe9df_50%)] px-2.5 py-2 font-bold text-[#304e36] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536b73] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
              onClick={onRoomShare}
              aria-label={shareText}
              data-room-lobby-share="true"
            >
              <Link2 size={20} aria-hidden="true" />
              <span role="status" aria-live="polite">
                {shareText}
              </span>
            </button>
          ) : (
            <span className="flex-1 text-sm">{view.isHost ? text.hostWaiting : text.eyebrow}</span>
          )}
          <button
            ref={infoButton}
            type="button"
            className="inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-[7px] border-2 border-[#627f85] bg-[linear-gradient(#fffdf0_50%,#dfe9df_50%)] px-2.5 py-2 font-bold text-[#304e36] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536b73] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
            data-room-lobby-controls
            aria-expanded={showInfo}
            aria-controls={infoId}
            onClick={() => setShowInfo(value => !value)}
          >
            {showInfo ? (
              <X size={18} aria-hidden="true" />
            ) : (
              <CircleHelp size={18} aria-hidden="true" />
            )}
            <span>{showInfo ? text.closeInfo : text.info}</span>
          </button>
        </div>
        <div className="min-h-0 min-w-0 overflow-hidden px-3">
          <section
            className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto]"
            aria-label={copy.participantListLabel}
          >
            <div className="flex items-center justify-between gap-2 pb-[7px] [&_h2]:text-sm [&_h2]:font-extrabold [&_p]:flex [&_p]:flex-wrap [&_p]:gap-2.5 [&_p]:text-xs [&_p]:text-[#596a52]">
              <div>
                <h2>{text.players}</h2>
                <p>
                  {copy.participantCount(view.participantCount)}{" "}
                  <span className="font-bold text-[#315c3e]">
                    {text.readyCount(readyCount, participants.length)}
                  </span>
                </p>
              </div>
              {view.isHost ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-[7px] border-2 border-[#627f85] bg-[linear-gradient(#fffdf0_50%,#dfe9df_50%)] px-2.5 py-2 font-bold text-[#304e36] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536b73] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
                  disabled={view.participantCount >= 8 || mutation !== null || !own?.connected}
                  onClick={() => void runMutation("ai-add", state.onAddAi)}
                  data-room-lobby-ai-add="true"
                >
                  <Bot size={18} aria-hidden="true" />
                  {copy.addAiAction}
                </button>
              ) : null}
            </div>
            <ul
              className="m-0 grid min-h-0 min-w-0 list-none content-start gap-[7px] overflow-y-auto overscroll-contain px-[3px] pt-[3px] pb-2 [scroll-padding-block:4px]"
              data-room-lobby-participants="true"
              tabIndex={0}
              aria-label={copy.participantListLabel}
              onKeyDown={event => {
                if (event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                event.currentTarget.scrollTop =
                  event.key === "Home" ? 0 : event.currentTarget.scrollHeight;
              }}
            >
              {state.projection.participants.map(participant => (
                <ParticipantRow
                  key={participant.playerId}
                  participant={participant}
                  projection={state.projection}
                  locale={fullCopy.locale}
                  canEditAi={view.isHost && mutation === null && !!own?.connected}
                  onChangeDifficulty={difficulty =>
                    void runMutation("ai-difficulty", () =>
                      state.onChangeAiDifficulty(participant.playerId, difficulty),
                    )
                  }
                  onRemove={() =>
                    void runMutation("ai-remove", () => state.onRemoveAi(participant.playerId))
                  }
                />
              ))}
              {state.projection.participants.length === 0 ? (
                <li className="p-6 text-center text-[#617154]">{text.empty}</li>
              ) : null}
            </ul>
            <p className="flex items-center gap-1.5 py-1.5 text-[0.6875rem] text-[#5a6b50]">
              <Bot size={16} aria-hidden="true" />
              {text.autoFill}
            </p>
          </section>
        </div>
        <footer
          className="grid gap-1.5 border-t-[3px] border-[#526e7a] bg-[#fffdf0] px-3 pt-2 pb-[9px] shadow-[inset_0_3px_0_#e9d689]"
          data-room-lobby-actions="true"
        >
          <p
            id={statusId}
            className="flex items-start gap-[7px] text-[0.8125rem] leading-[1.3] data-[complete=true]:text-[#315c3e] [&_svg]:mt-px"
            role="status"
            data-room-lobby-status="true"
            data-complete={!mutation && view.startDisabledReason === null}
          >
            {view.ownReady && !mutation ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Clock3 size={18} aria-hidden="true" />
            )}
            <span>{status}</span>
          </p>
          <p
            role="alert"
            className="text-sm text-[#9d302b] [overflow-wrap:anywhere] empty:hidden"
            data-room-lobby-error="true"
          >
            {errorMessage}
          </p>
          <div
            className="flex gap-2.5 [&>button]:min-h-[46px] [&>button]:flex-1 [&>button]:px-2.5 [&>button]:py-2"
            aria-busy={mutation !== null}
          >
            {own ? (
              <button
                type="button"
                className={cn(view.ownReady ? SECONDARY_BUTTON : PRIMARY_BUTTON)}
                aria-pressed={view.ownReady}
                disabled={view.readyDisabled}
                onClick={() => void runMutation("ready", () => state.onSetReady(!view.ownReady))}
                data-room-lobby-ready="true"
              >
                {mutation === "ready"
                  ? text.readyPending
                  : view.ownReady
                    ? copy.cancelReadyAction
                    : copy.readyAction}
                {!view.ownReady && mutation !== "ready" ? (
                  <Check size={20} aria-hidden="true" />
                ) : null}
              </button>
            ) : null}
            {view.isHost ? (
              <button
                type="button"
                className="inline-flex min-h-12 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-lg border-2 border-[#304550] bg-[linear-gradient(#638f62_50%,#386747_50%)] px-2.5 py-2 font-bold text-white shadow-[var(--hg-button)] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
                disabled={view.startDisabledReason !== null}
                aria-describedby={statusId}
                onClick={() => void runMutation("start", state.onStart)}
                data-room-lobby-start="true"
              >
                {mutation === "start" ? text.startPending : text.start}
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <p className="text-center text-[0.6875rem] leading-[1.25] text-[#66735d]">
            {copy.starterSelectionHint}
          </p>
        </footer>
      </div>
      {showInfo ? <RoomGameGuide locale={fullCopy.locale} id={infoId} onClose={closeInfo} /> : null}
    </section>
  );
}

function ParticipantRow({
  participant,
  projection,
  locale,
  canEditAi,
  onChangeDifficulty,
  onRemove,
}: {
  participant: TournamentRoomParticipant;
  projection: TournamentStateRoomPayload;
  locale: string;
  canEditAi: boolean;
  onChangeDifficulty(difficulty: AiDifficulty): void;
  onRemove(): void;
}) {
  const fullCopy = getPokeLoungeCopyForUrl(new URL(`http://localhost/${locale}`));
  const copy = fullCopy.lobby;
  const text = getRoomLobbyCopy(locale);
  const self = participant.playerId === projection.ownPlayerId;
  const host = participant.playerId === projection.hostPlayerId;
  const ai = participant.controller === "ai";
  const difficulty = participant.aiDifficulty ?? DEFAULT_AI_DIFFICULTY;
  const difficultyLabel = getAiDifficultyLabel(locale, difficulty);
  const spectator = participant.role !== "participant";
  const name = localizeTrainerName(participant.displayName, fullCopy.locale);
  const state = !participant.connected ? "offline" : participant.ready ? "ready" : "waiting";
  return (
    <li
      className="group/participant grid min-h-[68px] grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] border border-[#7c969a] bg-[linear-gradient(#fffdf0_0_50%,#e3edf0_50%)] p-[9px] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#9aada9] data-[room-lobby-self=true]:border-2 data-[room-lobby-self=true]:border-[#a47d39] data-[room-lobby-self=true]:bg-[linear-gradient(#fff4c9_50%,#ebddb3_50%)] data-[room-lobby-self=true]:p-2 data-[room-lobby-self=true]:shadow-[inset_0_0_0_2px_#fffdf0] data-[state=offline]:border-dashed data-[state=offline]:bg-[#e6e3db]"
      data-room-lobby-participant="true"
      data-player-id={participant.playerId}
      data-room-lobby-self={self ? "true" : undefined}
      data-state={state}
    >
      <span
        className="grid h-9 w-8 place-items-center rounded-md border-2 border-[#6c8c91] bg-[linear-gradient(#bdd8df_50%,#eaf1e8_50%)] text-[#3e6678]"
        aria-hidden="true"
      >
        {ai ? <Bot size={24} /> : <UserRound size={24} />}
      </span>
      <div className="min-w-0">
        <div className="flex flex-nowrap items-baseline gap-x-1.5 gap-y-1 [&_strong]:min-w-0 [&_strong]:text-[0.9375rem] [&_strong]:leading-[1.35] [&_strong]:font-bold [&_strong]:[overflow-wrap:anywhere] [&_strong]:[word-break:keep-all]">
          <strong>{name}</strong>
          {self ? (
            <span className="shrink-0 rounded bg-[#355c3f] px-[5px] text-[0.6875rem] whitespace-nowrap text-white">
              {text.me}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-[7px] gap-y-[3px] text-[0.6875rem] text-[#617154] [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
          {host ? (
            <span data-room-lobby-badge="true">
              <Crown size={13} aria-hidden="true" />
              {copy.hostBadge}
            </span>
          ) : null}
          {ai ? <span data-room-lobby-badge="true">{copy.aiBadge}</span> : null}
          {ai ? (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded-full border border-[#b9c8ae] bg-[#f4f7ec] px-[7px] py-0.5 font-bold leading-[1.35] text-[#49613f] enabled:hover:bg-[#e8f0db] focus-visible:outline-2 focus-visible:outline-[#315c3e] focus-visible:outline-offset-2 disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-[#617154]"
              disabled={!canEditAi}
              onClick={() => onChangeDifficulty(nextAiDifficulty(difficulty))}
              aria-label={copy.aiBadge + ": " + difficultyLabel}
              data-room-lobby-ai-difficulty={participant.playerId}
              data-difficulty={difficulty}
            >
              {difficultyLabel}
              {canEditAi ? <ChevronRight size={12} aria-hidden="true" /> : null}
            </button>
          ) : null}
          {spectator ? <span>{text.spectators}</span> : null}
          {!host && !ai && !spectator ? <span>{text.human}</span> : null}
          <span
            className="ml-auto inline-flex items-center gap-1 rounded border border-[#b3a480] bg-[#f8eed2] px-[5px] py-0.5 text-[0.6875rem] font-semibold text-[#726948] group-data-[state=ready]/participant:border-[#87a479] group-data-[state=ready]/participant:bg-[#dbeccf] group-data-[state=ready]/participant:text-[#2c6039] group-data-[state=offline]/participant:border-[#b1887b] group-data-[state=offline]/participant:bg-[#f0d8d0] group-data-[state=offline]/participant:text-[#9e4431]"
            data-room-lobby-badge="true"
          >
            {state === "offline" ? (
              <WifiOff size={16} aria-hidden="true" />
            ) : state === "ready" ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Clock3 size={16} aria-hidden="true" />
            )}
            {state === "offline"
              ? copy.disconnected
              : spectator
                ? text.spectators
                : state === "ready"
                  ? copy.ready
                  : copy.notReady}
          </span>
        </div>
      </div>

      {ai && canEditAi ? (
        <button
          type="button"
          className="grid size-11 place-items-center rounded-[10px] border border-[#d5c6b5] bg-[#fff7eb] text-[#855041] focus-visible:outline-2 focus-visible:outline-[#985512] focus-visible:outline-offset-2"
          onClick={onRemove}
          aria-label={text.removeAi(name)}
          data-room-lobby-ai-remove={participant.playerId}
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

function getAiDifficultyLabel(locale: string, difficulty: AiDifficulty): string {
  if (locale.toLowerCase().startsWith("ko")) {
    return { easy: "쉬움", normal: "보통", hard: "어려움" }[difficulty];
  }
  if (locale.toLowerCase().startsWith("ja")) {
    return { easy: "かんたん", normal: "ふつう", hard: "むずかしい" }[difficulty];
  }
  return { easy: "Easy", normal: "Normal", hard: "Hard" }[difficulty];
}
