import { RoomLobbyScreen } from "./room-lobby-view";
import { DirectMultiplayerEntryScreen } from "./room-invitation-screen";
export { RoomLobbyScreen } from "./room-lobby-view";
import { useState, type FormEvent } from "react";
import {
  DEFAULT_ROUND_DURATION_MS,
  ROUND_DURATION_OPTIONS_MS,
} from "@poke-lounge/battle/round-settings";
import { getPokeLoungeCopyForUrl, type PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { StarterPokemon } from "../../types";
import { playPokeLoungeSfx, primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import {
  createTemporaryPassword,
  deriveTemporaryRoomCode,
  normalizeTemporaryPassword,
  TEMPORARY_PASSWORD_LENGTH,
} from "../network/room-entry";
import {
  normalizeMultiplayerDisplayName,
  resolveInitialMultiplayerDisplayName,
} from "../network/room-entry-screen";
import { getWebRtcSignalingCopy } from "../network/web-rtc-signaling-panel";
import { localizePokemonName, localizeTypeName } from "../i18n/runtime-game-localization";

export function PokeLoungeRuntimeScreen({
  roomShareAvailable,
  roomShareLabel,
  state,
  onRoomShare,
  onOpenSettings,
}: {
  roomShareAvailable: boolean;
  roomShareLabel: string;
  state: PokeLoungeRuntimeState;
  onRoomShare(): void;
  onOpenSettings?: () => void;
}) {
  if (state.phase === "entry") {
    return state.screen === "room" ? (
      <RoomEntryScreen state={state} />
    ) : (
      <DirectMultiplayerEntryScreen state={state} />
    );
  }
  if (state.phase === "starter") {
    return <StarterSelectionScreen copy={getCurrentRuntimeCopy()} state={state} />;
  }
  if (state.phase === "loading") {
    return <RuntimeLoadingScreen copy={getCurrentRuntimeCopy()} state={state} />;
  }
  if (state.phase === "error") {
    return <RuntimeErrorScreen state={state} />;
  }
  if (state.phase === "lobby") {
    return (
      <RoomLobbyScreen
        key={`${state.projection.roomCode}:${state.projection.ownPlayerId}`}
        onOpenSettings={onOpenSettings}
        roomShareAvailable={roomShareAvailable}
        roomShareLabel={roomShareLabel}
        state={state}
        onRoomShare={onRoomShare}
      />
    );
  }
  return null;
}

export function PokeLoungeRuntimeControls({ state }: { state: PokeLoungeRuntimeState }) {
  if (state.phase !== "world" && state.phase !== "battle" && state.phase !== "lobby") {
    return null;
  }

  return state.webRtc ? (
    <WebRtcSignalingPanel room={state.webRtc.room} onLeave={state.webRtc.onLeave} />
  ) : null;
}

function RoomEntryScreen({
  state,
}: {
  state: Extract<PokeLoungeRuntimeState, { phase: "entry"; screen: "room" }>;
}) {
  const copy = getPokeLoungeCopyForUrl(state.currentUrl);
  const [displayName, setDisplayName] = useState(function callback() {
    return resolveInitialMultiplayerDisplayName(
      state.initialDisplayName,
      copy.roomEntry.multiplayerNameModifiers,
      copy.roomEntry.multiplayerNameNouns,
    );
  });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [roundDurationMs, setRoundDurationMs] =
    useState<(typeof ROUND_DURATION_OPTIONS_MS)[number]>(DEFAULT_ROUND_DURATION_MS);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const selectMultiplayer = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = normalizeMultiplayerDisplayName(displayName);
    const normalizedPassword = normalizeTemporaryPassword(temporaryPassword);
    setDisplayName(normalizedName);
    setTemporaryPassword(normalizedPassword);
    if (!normalizedName) {
      setMessage(copy.roomEntry.multiplayerNameRequired);
      return;
    }
    if (normalizedPassword.length !== TEMPORARY_PASSWORD_LENGTH) {
      setMessage(copy.roomEntry.temporaryPasswordRequired);
      return;
    }

    setPending(true);
    setMessage(copy.roomEntry.preparing);
    try {
      const roomCode = await deriveTemporaryRoomCode(normalizedPassword);
      playConfirmSound();
      state.onSelect({
        mode: "server-room",
        roomCode,
        inviteUrl: null,
        displayName: normalizedName,
        createRoom: true,
        roundDurationMs,
      });
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.multiplayerConnectFailed);
    }
  };

  return (
    <section
      className="room-entry-screen room-entry-create-screen"
      data-room-entry-screen="true"
      data-local-test-mode-active={state.localTestMode?.active || undefined}
    >
      <div className="room-entry-panel room-entry-create-panel">
        <header className="room-entry-intro">
          <div className="room-entry-brand">
            <span className="room-entry-emblem" aria-hidden="true" />
            <span>POKE LOUNGE</span>
          </div>
          <div className="room-entry-intro-heading">
            <h1>{copy.roomEntry.title}</h1>
            <p>{copy.roomEntry.multiplayerDescription}</p>
          </div>
          <FanNotice copy={copy} />
        </header>
        {state.localTestMode ? (
          <section
            className="room-entry-workspace room-entry-local-test"
            data-room-entry-mode="solo"
            data-room-entry-local-test="true"
            data-local-test-mode-active={state.localTestMode.active || undefined}
            aria-label={copy.roomEntry.localTestTitle}
          >
            <header className="room-entry-workspace-heading">
              <h2>{copy.roomEntry.localTestTitle}</h2>
            </header>
            <p className="room-entry-field-copy">{copy.roomEntry.localTestDescription}</p>
            <div className="room-entry-local-test-actions">
              <button
                type="button"
                disabled={pending}
                onClick={function handleClick() {
                  playConfirmSound();
                  setPending(true);
                  setMessage(copy.roomEntry.preparing);
                  state.localTestMode?.onStart();
                }}
                data-room-entry-local-test-start
              >
                {state.localTestMode.active
                  ? copy.roomEntry.localTestContinue
                  : copy.roomEntry.localTestStart}
              </button>
              {state.localTestMode.active ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={function handleClick() {
                    playConfirmSound();
                    setPending(true);
                    setMessage(copy.roomEntry.preparing);
                    state.localTestMode?.onExit();
                  }}
                  data-room-entry-local-test-exit
                >
                  {copy.roomEntry.localTestExit}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
        {!state.localTestMode?.active ? (
          <section
            className="room-entry-workspace"
            data-room-entry-mode="multiplayer"
            aria-label={copy.roomEntry.multiplayerTitle}
          >
            <header className="room-entry-workspace-heading">
              <h2>{copy.roomEntry.multiplayerTitle}</h2>
              <span className="room-entry-room-status">
                <span aria-hidden="true" />
                {copy.roomEntry.privateGameTitle}
              </span>
            </header>
            <form className="room-entry-mode-content room-entry-form" onSubmit={selectMultiplayer}>
              <LabeledField
                id="poke-lounge-multiplayer-display-name"
                label={copy.roomEntry.multiplayerNameLabel}
                description={copy.roomEntry.multiplayerNameDescription}
              >
                <input
                  id="poke-lounge-multiplayer-display-name"
                  type="text"
                  autoComplete="off"
                  maxLength={12}
                  placeholder={copy.roomEntry.multiplayerNamePlaceholder}
                  value={displayName}
                  disabled={pending}
                  aria-invalid={!displayName.trim() || undefined}
                  onChange={function handleChange(event) {
                    setDisplayName(event.currentTarget.value);
                    setMessage("");
                  }}
                  data-room-entry-display-name
                />
              </LabeledField>
              <fieldset className="room-entry-visibility" data-room-entry-visibility>
                <legend className="room-entry-field-label">
                  {copy.roomEntry.roomVisibilityLabel}
                </legend>
                <label className="room-entry-visibility-option">
                  <input
                    type="radio"
                    name="room-visibility"
                    value="public"
                    disabled
                    data-room-entry-visibility-public
                  />
                  <span>{copy.roomEntry.publicGameTitle}</span>
                  <small>{copy.roomEntry.publicGameDescription}</small>
                </label>
                <label className="room-entry-visibility-option">
                  <input
                    type="radio"
                    name="room-visibility"
                    value="private"
                    defaultChecked
                    disabled={pending}
                    data-room-entry-visibility-private
                  />
                  <span>{copy.roomEntry.privateGameTitle}</span>
                </label>
              </fieldset>
              <fieldset className="room-entry-visibility room-entry-duration" disabled={pending}>
                <legend className="room-entry-field-label">
                  {copy.roomEntry.roundDurationLabel}
                </legend>
                {ROUND_DURATION_OPTIONS_MS.map((duration, index) => (
                  <label key={duration} className="room-entry-visibility-option">
                    <input
                      type="radio"
                      name="round-duration"
                      value={duration}
                      checked={roundDurationMs === duration}
                      onChange={() => setRoundDurationMs(duration)}
                      data-room-entry-round-duration
                    />
                    <span>{copy.roomEntry.roundDurationOptions[index]}</span>
                  </label>
                ))}
              </fieldset>
              <p className="room-entry-field-copy">{copy.roomEntry.roundDurationDescription}</p>
              <LabeledField
                id="poke-lounge-temporary-password"
                label={copy.roomEntry.temporaryPasswordLabel}
                description={copy.roomEntry.temporaryPasswordDescription}
              >
                <div className="room-entry-password-row">
                  <input
                    id="poke-lounge-temporary-password"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={TEMPORARY_PASSWORD_LENGTH}
                    placeholder={copy.roomEntry.temporaryPasswordPlaceholder}
                    value={temporaryPassword}
                    disabled={pending}
                    aria-invalid={
                      temporaryPassword.length !== TEMPORARY_PASSWORD_LENGTH || undefined
                    }
                    onChange={function handleChange(event) {
                      setTemporaryPassword(normalizeTemporaryPassword(event.currentTarget.value));
                      setMessage("");
                    }}
                    data-room-entry-temporary-password
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={function handleClick() {
                      setTemporaryPassword(createTemporaryPassword());
                      setMessage("");
                    }}
                    data-room-entry-temporary-password-generate
                  >
                    {copy.roomEntry.temporaryPasswordGenerate}
                  </button>
                </div>
              </LabeledField>
              <button
                type="submit"
                className="room-entry-submit"
                disabled={pending}
                data-room-entry-multiplayer-submit
              >
                <span>{copy.roomEntry.multiplayerConnect}</span>
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p
              className="room-entry-message"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-room-entry-message="true"
            >
              {message}
            </p>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function StarterSelectionScreen({
  copy,
  state,
}: {
  copy: PokeLoungeCopy;
  state: Extract<PokeLoungeRuntimeState, { phase: "starter" }>;
}) {
  const [selectedStarterId, setSelectedStarterId] = useState(state.bootstrap.starters[0]?.id ?? "");
  const selectedStarter =
    state.bootstrap.starters.find(function findItem(starter) {
      return starter.id === selectedStarterId;
    }) ??
    state.bootstrap.starters[0] ??
    null;

  return (
    <section
      className="game-screen game-screen--starter-modal"
      data-screen="starter-selection"
      data-ui-assets="not-loaded"
    >
      <div className="selection-panel starter-selection-modal">
        <header className="selection-header">
          <div className="title-block">
            <p className="kicker">Poke Lounge</p>
            <h1>{copy.game.starterTitle}</h1>
          </div>
        </header>
        <div className="selection-body">
          <StarterPreview copy={copy} starter={selectedStarter} onConfirm={state.onSelect} />
          <div className="starter-grid" aria-label={copy.game.starterOptionsLabel}>
            {state.bootstrap.starters.map(function mapItem(starter) {
              return (
                <StarterCard
                  key={starter.id}
                  copy={copy}
                  starter={starter}
                  selected={starter.id === selectedStarter?.id}
                  onSelect={function handleSelect() {
                    void primePokeLoungeAudio();
                    playPokeLoungeSfx("button-confirm", { volume: 0.4 });
                    setSelectedStarterId(starter.id);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function StarterPreview({
  copy,
  starter,
  onConfirm,
}: {
  copy: PokeLoungeCopy;
  starter: StarterPokemon | null;
  onConfirm(starter: StarterPokemon): void;
}) {
  if (!starter) {
    return (
      <section
        className="starter-modal-preview"
        data-starter-preview
        aria-label={copy.game.starterPreviewLabel}
      >
        {copy.game.starterUnavailable}
      </section>
    );
  }

  return (
    <section
      className="starter-modal-preview"
      data-starter-preview
      data-selected-starter={starter.id}
      aria-label={copy.game.starterPreviewLabel}
    >
      <div className="starter-preview-stage">
        <StarterSprite copy={copy} starter={starter} className="starter-preview-sprite" />
      </div>
      <div className="starter-preview-meta">
        <strong className="starter-preview-name">
          {localizePokemonName(starter.displayName, copy.locale)}
        </strong>
        <span className={`starter-type starter-type--${starter.type.toLowerCase()}`}>
          {localizeTypeName(starter.type, copy.locale)}
        </span>
        <button
          type="button"
          className="starter-confirm-button"
          onClick={function handleClick() {
            void primePokeLoungeAudio();
            playPokeLoungeSfx("button-confirm");
            onConfirm(starter);
          }}
          data-starter-confirm
        >
          {copy.game.starterConfirm}
        </button>
      </div>
    </section>
  );
}

function StarterCard({
  copy,
  starter,
  selected,
  onSelect,
}: {
  copy: PokeLoungeCopy;
  starter: StarterPokemon;
  selected: boolean;
  onSelect(): void;
}) {
  const [missing, setMissing] = useState(false);

  return (
    <button
      type="button"
      className={`starter-card starter-card--${starter.type.toLowerCase()} ${selected ? "is-selected" : ""} ${missing ? "is-missing-asset" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
      data-starter-card={starter.id}
    >
      <StarterSprite copy={copy} starter={starter} className="starter-sprite" hidden={missing} />
      {/* The hidden native probe must preserve the original per-ROM-file error event. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="starter-asset-probe"
        src={starter.assetPath}
        alt=""
        aria-hidden="true"
        onError={function handleError() {
          return setMissing(true);
        }}
      />
      <span className="starter-asset-status" role="status" hidden={!missing}>
        {missing ? copy.game.starterAssetMissing(starter.assetPath) : ""}
      </span>
      <span className="starter-name">{localizePokemonName(starter.displayName, copy.locale)}</span>
      <span className="starter-type">{localizeTypeName(starter.type, copy.locale)}</span>
    </button>
  );
}

function StarterSprite({
  copy,
  starter,
  className,
  hidden,
}: {
  copy: PokeLoungeCopy;
  starter: StarterPokemon;
  className: string;
  hidden?: boolean;
}) {
  return (
    <span
      className={className}
      style={{ backgroundImage: `url("${starter.assetPath}")` }}
      role="img"
      aria-label={localizePokemonName(starter.displayName, copy.locale)}
      hidden={hidden}
      data-asset-path={starter.assetPath}
    />
  );
}

function RuntimeLoadingScreen({
  copy,
  state,
}: {
  copy: PokeLoungeCopy;
  state: Extract<PokeLoungeRuntimeState, { phase: "loading" }>;
}) {
  const percent = Math.round(state.progress.ratio * 100);

  return (
    <section
      className="room-entry-screen game-startup-screen"
      role="status"
      aria-live="polite"
      data-game-runtime-loading="true"
    >
      <div className="room-entry-panel game-startup-panel">
        <h1>Poke Lounge</h1>
        <p className="room-entry-mode-copy">{copy.game.resourcesPreparing}</p>
        <progress
          max={state.progress.total || 1}
          value={state.progress.loaded}
          aria-label={`${percent}%`}
        />
        <strong>{percent}%</strong>
      </div>
    </section>
  );
}

function RuntimeErrorScreen({
  state,
}: {
  state: Extract<PokeLoungeRuntimeState, { phase: "error" }>;
}) {
  const copy = getPokeLoungeCopyForUrl(
    new URL(typeof window === "undefined" ? "http://localhost/ko-KR" : window.location.href),
  );
  const [retrying, setRetrying] = useState(false);

  return (
    <section
      className="room-entry-screen game-startup-screen"
      role="alert"
      aria-live="assertive"
      data-game-startup-error="true"
      data-testid="poke-lounge-startup-error"
    >
      <div className="room-entry-panel game-startup-panel">
        <h1>{copy.startup.title}</h1>
        <p className="room-entry-mode-copy">{state.description || copy.startup.description}</p>
        <div className="room-entry-mode-actions" data-game-startup-error-actions="true">
          {state.onRetry ? (
            <button
              type="button"
              disabled={retrying}
              onClick={function handleClick() {
                setRetrying(true);
                state.onRetry?.();
              }}
              data-game-startup-retry
            >
              {retrying ? copy.startup.retrying : copy.startup.retry}
            </button>
          ) : null}
          <button
            type="button"
            disabled={retrying}
            onClick={state.onReturnToEntry}
            data-game-startup-return
          >
            {copy.startup.lobby}
          </button>
        </div>
      </div>
    </section>
  );
}

function getCurrentRuntimeCopy(): PokeLoungeCopy {
  return getPokeLoungeCopyForUrl(
    new URL(typeof window === "undefined" ? "http://localhost/ko-KR" : window.location.href),
  );
}

export function WebRtcSignalingPanel({
  room,
  onLeave,
}: {
  room: NonNullable<
    Extract<PokeLoungeRuntimeState, { phase: "world" | "battle" | "lobby" }>["webRtc"]
  >["room"];
  onLeave(): void;
}) {
  const copy = getWebRtcSignalingCopy(
    typeof document === "undefined" ? null : document.documentElement.lang,
  );
  const [status, setStatus] = useState(copy.waiting);
  const [localSignal, setLocalSignal] = useState("");
  const [remoteSignal, setRemoteSignal] = useState("");
  const [processing, setProcessing] = useState(false);
  const run = async (action: () => Promise<string | void>, success: string) => {
    setProcessing(true);
    setStatus(copy.processing);
    try {
      const signal = await action();
      if (typeof signal === "string") {
        setLocalSignal(signal);
      }
      setStatus(success);
    } catch {
      setStatus(copy.failed);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="webrtc-signaling-panel" data-webrtc-signaling-panel="true">
      <strong>WebRTC {room.sessionId}</strong>
      <span
        className="webrtc-signaling-panel__status"
        role="status"
        aria-live="polite"
        data-webrtc-status="true"
      >
        {status}
      </span>
      <textarea
        className="webrtc-signaling-panel__textarea"
        value={localSignal}
        readOnly
        placeholder={copy.localSignal}
        data-webrtc-local-signal="true"
      />
      <textarea
        className="webrtc-signaling-panel__textarea"
        value={remoteSignal}
        disabled={processing}
        placeholder={copy.remoteSignal}
        onChange={function handleChange(event) {
          return setRemoteSignal(event.currentTarget.value);
        }}
        data-webrtc-remote-signal="true"
      />
      <div className="webrtc-signaling-panel__actions">
        <button
          type="button"
          className="webrtc-signaling-panel__button"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.createOfferSignal();
            }, copy.offerCreated);
          }}
          data-webrtc-create-offer="true"
        >
          {copy.createOffer}
        </button>
        <button
          type="button"
          className="webrtc-signaling-panel__button"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.acceptOfferSignal(remoteSignal.trim());
            }, copy.answerCreated);
          }}
          data-webrtc-accept-offer="true"
        >
          {copy.acceptOffer}
        </button>
        <button
          type="button"
          className="webrtc-signaling-panel__button"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.acceptAnswerSignal(remoteSignal.trim());
            }, copy.answerApplied);
          }}
          data-webrtc-accept-answer="true"
        >
          {copy.acceptAnswer}
        </button>
        <button
          type="button"
          className="webrtc-signaling-panel__button webrtc-signaling-panel__button--danger"
          disabled={processing}
          onClick={function handleClick() {
            room.dispose();
            setStatus(copy.ended);
            onLeave();
          }}
          data-webrtc-leave="true"
        >
          {copy.leave}
        </button>
      </div>
    </section>
  );
}

function LabeledField({
  id,
  label,
  description,
  className = "",
  children,
}: {
  id: string;
  label: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`room-entry-field ${className}`}>
      <label className="room-entry-field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className="room-entry-field-copy">{description}</p>
    </div>
  );
}

function FanNotice({ copy }: { copy: PokeLoungeCopy }) {
  return (
    <p className="room-entry-notice" data-poke-lounge-fan-notice="true">
      {copy.roomEntry.fanNotice}
    </p>
  );
}

function playConfirmSound(): void {
  void primePokeLoungeAudio();
  playPokeLoungeSfx("button-confirm");
}
