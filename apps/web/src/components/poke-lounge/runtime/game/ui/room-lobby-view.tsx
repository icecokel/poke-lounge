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
import { useEffect, useId, useRef, useState } from "react";
import { getPokeLoungeCopyForUrl } from "../../../poke-lounge-copy";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { localizeTrainerName } from "../i18n/runtime-game-localization";
import { resetVirtualGamepad } from "../input/virtual-gamepad";
import type {
  TournamentRoomParticipant,
  TournamentStateRoomPayload,
} from "../network/tournament-projection";
import { RoomControlsGuide } from "./room-controls-guide";
import { getRoomLobbyCopy } from "./room-lobby-copy";
import { createRoomLobbyViewState } from "./room-lobby-screen";
import styles from "./room-lobby.module.css";
import { useRoomLobbyCommands } from "./use-room-lobby-commands";

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
      className={styles.screen}
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
      <div className={styles.panel}>
        <header className={styles.header}>
          <span className={styles.emblem} aria-hidden="true">
            <Users size={26} />
          </span>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>POKE LOUNGE</p>
            <h1 ref={heading} tabIndex={-1} id={titleId}>
              {copy.title}
            </h1>
          </div>
          {onOpenSettings ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onOpenSettings}
              aria-label={fullCopy.settingsOpenLabel}
              data-poke-lounge-mobile-menu="true"
            >
              <Menu size={24} />
            </button>
          ) : null}
        </header>
        <div className={styles.roomBar}>
          <span className={styles.roomCode}>
            <span>{text.room}</span>
            <strong data-room-lobby-code>{state.projection.roomCode}</strong>
          </span>
          <span className={styles.duration} data-room-lobby-duration>
            <Clock3 size={16} aria-hidden="true" />
            <span>
              {text.duration} <b>{duration}</b>
            </span>
          </span>
        </div>
        <div className={styles.tools}>
          {roomShareAvailable ? (
            <button
              type="button"
              className={styles.inviteButton}
              onClick={onRoomShare}
              data-room-lobby-share="true"
            >
              <Link2 size={20} aria-hidden="true" />
              <span role="status" aria-live="polite">
                {shareText}
              </span>
            </button>
          ) : (
            <span className={styles.inviteHint}>
              {view.isHost ? text.hostWaiting : text.eyebrow}
            </span>
          )}
          <button
            ref={infoButton}
            type="button"
            className={styles.secondaryButton}
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
        <div className={styles.content}>
          {showInfo ? (
            <section id={infoId} className={styles.infoBody} aria-label={text.info} tabIndex={0}>
              <div className={styles.infoCard}>
                <h2>{text.next}</h2>
                <ol className={styles.steps}>
                  <li aria-current="step">
                    <b>1</b>
                    {text.stepLobby}
                  </li>
                  <li>
                    <b>2</b>
                    {text.stepPokemon}
                  </li>
                  <li>
                    <b>3</b>
                    {text.stepExplore}
                  </li>
                </ol>
                <p>{copy.starterSelectionHint}</p>
                <p data-room-lobby-auto-fill-notice="true">{copy.autoFillNotice}</p>
              </div>
              <RoomControlsGuide locale={fullCopy.locale} />
            </section>
          ) : (
            <section className={styles.roster} aria-label={copy.participantListLabel}>
              <div className={styles.rosterHeader}>
                <div>
                  <h2>{text.players}</h2>
                  <p>
                    {copy.participantCount(view.participantCount)}{" "}
                    <span className={styles.readyCount}>
                      {text.readyCount(readyCount, participants.length)}
                    </span>
                  </p>
                </div>
                {view.isHost ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
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
                className={styles.participants}
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
                    canRemove={view.isHost && mutation === null && !!own?.connected}
                    onRemove={() =>
                      void runMutation("ai-remove", () => state.onRemoveAi(participant.playerId))
                    }
                  />
                ))}
                {state.projection.participants.length === 0 ? (
                  <li className={styles.empty}>{text.empty}</li>
                ) : null}
              </ul>
              <p className={styles.autoFill}>
                <Bot size={16} aria-hidden="true" />
                {text.autoFill}
              </p>
            </section>
          )}
        </div>
        <footer className={styles.footer} data-room-lobby-actions="true">
          <p
            id={statusId}
            className={styles.status}
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
          <p role="alert" className={styles.error} data-room-lobby-error="true">
            {errorMessage}
          </p>
          <div className={styles.actions} aria-busy={mutation !== null}>
            {own ? (
              <button
                type="button"
                className={view.ownReady ? styles.secondaryButton : styles.primaryButton}
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
                className={styles.primaryButton}
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
          <p className={styles.nextStep}>{copy.starterSelectionHint}</p>
        </footer>
      </div>
    </section>
  );
}

function ParticipantRow({
  participant,
  projection,
  locale,
  canRemove,
  onRemove,
}: {
  participant: TournamentRoomParticipant;
  projection: TournamentStateRoomPayload;
  locale: string;
  canRemove: boolean;
  onRemove(): void;
}) {
  const fullCopy = getPokeLoungeCopyForUrl(new URL(`http://localhost/${locale}`));
  const copy = fullCopy.lobby;
  const text = getRoomLobbyCopy(locale);
  const self = participant.playerId === projection.ownPlayerId;
  const host = participant.playerId === projection.hostPlayerId;
  const ai = participant.controller === "ai";
  const spectator = participant.role !== "participant";
  const name = localizeTrainerName(participant.displayName, fullCopy.locale);
  const state = !participant.connected ? "offline" : participant.ready ? "ready" : "waiting";
  return (
    <li
      className={styles.participant}
      data-room-lobby-participant="true"
      data-player-id={participant.playerId}
      data-room-lobby-self={self ? "true" : undefined}
      data-state={state}
    >
      <span className={styles.avatar} aria-hidden="true">
        {ai ? <Bot size={24} /> : <UserRound size={24} />}
      </span>
      <div className={styles.identity}>
        <div className={styles.name}>
          <strong>{name}</strong>
          {self ? <span className={styles.self}>{text.me}</span> : null}
        </div>
        <div className={styles.roles}>
          {host ? (
            <span data-room-lobby-badge="true">
              <Crown size={13} aria-hidden="true" />
              {copy.hostBadge}
            </span>
          ) : null}
          {ai ? <span data-room-lobby-badge="true">{copy.aiBadge}</span> : null}
          {spectator ? <span>{text.spectators}</span> : null}
          {!host && !ai && !spectator ? <span>{text.human}</span> : null}
          <span className={styles.participantStatus} data-room-lobby-badge="true">
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

      {ai && canRemove ? (
        <button
          type="button"
          className={styles.removeButton}
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
