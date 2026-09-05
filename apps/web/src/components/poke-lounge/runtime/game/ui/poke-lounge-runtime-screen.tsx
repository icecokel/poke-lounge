import { RoomControlsGuide } from "./room-controls-guide";
import { getRoomControlsCopy } from "./room-controls-copy";
import { useState, type FormEvent, type ReactNode } from "react";
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
import { createRoomLobbyViewState, type RoomLobbyMutation } from "./room-lobby-screen";
import {
  localizePokemonName,
  localizeTrainerName,
  localizeTypeName,
} from "../i18n/runtime-game-localization";

export function PokeLoungeRuntimeScreen({
  roomShareAvailable,
  roomShareLabel,
  state,
  onRoomShare,
}: {
  roomShareAvailable: boolean;
  roomShareLabel: string;
  state: PokeLoungeRuntimeState;
  onRoomShare(): void;
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

function DirectMultiplayerEntryScreen({
  state,
}: {
  state: Extract<PokeLoungeRuntimeState, { phase: "entry"; screen: "direct-multiplayer" }>;
}) {
  const copy = getPokeLoungeCopyForUrl(state.currentUrl);
  const [displayName, setDisplayName] = useState(function callback() {
    return resolveInitialMultiplayerDisplayName(
      state.initialDisplayName,
      copy.roomEntry.multiplayerNameModifiers,
      copy.roomEntry.multiplayerNameNouns,
    );
  });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = normalizeMultiplayerDisplayName(displayName);
    setDisplayName(normalizedName);
    if (!normalizedName) {
      setMessage(copy.roomEntry.multiplayerNameRequired);
      return;
    }
    playConfirmSound();
    setPending(true);
    setMessage(copy.roomEntry.preparing);
    state.onSubmit(normalizedName);
  };

  return (
    <section className="room-entry-screen" data-room-entry-direct-multiplayer="true">
      <form className="room-entry-panel" onSubmit={submit}>
        <h1>{copy.roomEntry.multiplayerEntryTitle}</h1>
        <FanNotice copy={copy} />
        <LabeledField
          id="poke-lounge-multiplayer-display-name"
          label={copy.roomEntry.multiplayerNameLabel}
          description={copy.roomEntry.multiplayerNameDescription}
          className="room-entry-multiplayer-name"
        >
          <input
            id="poke-lounge-multiplayer-display-name"
            type="text"
            autoComplete="off"
            maxLength={12}
            placeholder={copy.roomEntry.multiplayerNamePlaceholder}
            value={displayName}
            disabled={pending}
            onChange={function handleChange(event) {
              setDisplayName(event.currentTarget.value);
              setMessage("");
            }}
            data-room-entry-display-name
            data-room-entry-direct-multiplayer-name="true"
          />
        </LabeledField>
        <button type="submit" disabled={pending} data-room-entry-direct-multiplayer-submit>
          {copy.roomEntry.multiplayerEntrySubmit}
        </button>
        <p
          className="room-entry-message"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          data-room-entry-message="true"
        >
          {message}
        </p>
      </form>
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

export function RoomLobbyScreen({
  roomShareAvailable,
  roomShareLabel,
  state,
  onRoomShare,
}: {
  roomShareAvailable: boolean;
  roomShareLabel: string;
  state: Extract<PokeLoungeRuntimeState, { phase: "lobby" }>;
  onRoomShare(): void;
}) {
  const fullCopy = getPokeLoungeCopyForUrl(
    new URL(typeof window === "undefined" ? "http://localhost/ko-KR" : window.location.href),
  );
  const copy = fullCopy.lobby;
  const [showControls, setShowControls] = useState(false);
  const controlsCopy = getRoomControlsCopy(fullCopy.locale);
  const [mutation, setMutation] = useState<RoomLobbyMutation>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const view = createRoomLobbyViewState(state.projection, mutation);
  const runMutation = async (
    kind: Exclude<RoomLobbyMutation, null>,
    action: () => Promise<void>,
  ) => {
    if (mutation) return;
    setMutation(kind);
    setErrorMessage("");
    try {
      await action();
    } catch {
      setErrorMessage(copy.mutationFailed);
    } finally {
      setMutation(null);
    }
  };
  const status = view.isHost
    ? view.startDisabledReason
      ? copy.startDisabledReason[view.startDisabledReason]
      : copy.hostReady
    : copy.guestWaiting;

  return (
    <section
      className="room-lobby-screen"
      data-room-lobby="true"
      aria-labelledby="room-lobby-title"
    >
      <div className="room-lobby-panel">
        <RoomLobbyHeader copy={copy} participantCount={view.participantCount}>
          <button
            type="button"
            className="room-lobby-controls-toggle"
            data-room-lobby-controls
            aria-expanded={showControls}
            aria-controls={showControls ? "room-controls-guide" : undefined}
            onClick={function toggleControls() {
              setShowControls(function toggle(current) {
                return !current;
              });
            }}
          >
            {showControls ? controlsCopy.close : controlsCopy.open}
          </button>
        </RoomLobbyHeader>
        {showControls ? (
          <RoomControlsGuide locale={fullCopy.locale} />
        ) : (
          <>
            <RoomLobbyParticipantList
              copy={copy}
              locale={fullCopy.locale}
              mutation={mutation}
              projection={state.projection}
              onRemoveAi={function handleRemoveAi(aiPlayerId) {
                return void runMutation("ai-remove", function callback() {
                  return state.onRemoveAi(aiPlayerId);
                });
              }}
            />
          </>
        )}
        <RoomLobbyActions
          copy={copy}
          onAddAi={function handleAddAi() {
            return void runMutation("ai-add", state.onAddAi);
          }}
          onReady={function handleReady() {
            return void runMutation("ready", function callback() {
              return state.onSetReady(!view.ownReady);
            });
          }}
          onRoomShare={onRoomShare}
          onStart={function handleStart() {
            return void runMutation("start", state.onStart);
          }}
          roomShareAvailable={roomShareAvailable}
          roomShareLabel={roomShareLabel}
          view={view}
        />
        <RoomLobbyStatus
          errorMessage={errorMessage}
          status={`${status} ${copy.starterSelectionHint}`}
        />
      </div>
    </section>
  );
}

export function RoomLobbyHeader({
  children,
  copy,
  participantCount,
}: {
  copy: PokeLoungeCopy["lobby"];
  participantCount: number;
  children?: ReactNode;
}) {
  return (
    <header className="room-lobby-header">
      <h2 id="room-lobby-title">{copy.title}</h2>
      <p>{copy.participantCount(participantCount)}</p>
      {children}
    </header>
  );
}

export function RoomLobbyParticipantList({
  copy,
  locale,
  mutation,
  onRemoveAi,
  projection,
}: {
  copy: PokeLoungeCopy["lobby"];
  locale: PokeLoungeCopy["locale"];
  mutation: RoomLobbyMutation;
  onRemoveAi(aiPlayerId: string): void;
  projection: Extract<PokeLoungeRuntimeState, { phase: "lobby" }>["projection"];
}) {
  return (
    <ul
      className="room-lobby-participants"
      data-room-lobby-participants="true"
      tabIndex={0}
      aria-label={copy.participantListLabel}
      onKeyDown={function handleKeyDown(event) {
        if (event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        event.currentTarget.scrollTop = event.key === "Home" ? 0 : event.currentTarget.scrollHeight;
      }}
    >
      {projection.participants.map(function mapItem(participant) {
        return (
          <RoomLobbyParticipantRow
            key={participant.playerId}
            copy={copy}
            locale={locale}
            hostPlayerId={projection.hostPlayerId}
            canRemoveAi={projection.hostPlayerId === projection.ownPlayerId && mutation === null}
            onRemoveAi={onRemoveAi}
            participant={participant}
          />
        );
      })}
    </ul>
  );
}

export function RoomLobbyParticipantRow({
  canRemoveAi,
  copy,
  hostPlayerId,
  locale,
  onRemoveAi,
  participant,
}: {
  canRemoveAi: boolean;
  copy: PokeLoungeCopy["lobby"];
  hostPlayerId: string | null;
  locale: PokeLoungeCopy["locale"];
  onRemoveAi(aiPlayerId: string): void;
  participant: Extract<
    PokeLoungeRuntimeState,
    { phase: "lobby" }
  >["projection"]["participants"][number];
}) {
  const badges = [
    participant.playerId === hostPlayerId ? copy.hostBadge : null,
    participant.controller === "ai" ? copy.aiBadge : null,
    participant.ready ? copy.ready : copy.notReady,
    participant.connected ? copy.connected : copy.disconnected,
  ].filter(function filterItem(label): label is string {
    return Boolean(label);
  });

  return (
    <li
      className="room-lobby-participant"
      data-player-id={participant.playerId}
      data-room-lobby-participant="true"
    >
      <strong>{localizeTrainerName(participant.displayName, locale)}</strong>
      <span className="room-lobby-badges">
        {badges.map(function mapItem(label) {
          return <RoomLobbyBadge key={label} label={label} />;
        })}
      </span>
      {participant.controller === "ai" && canRemoveAi ? (
        <button
          type="button"
          onClick={function handleClick() {
            onRemoveAi(participant.playerId);
          }}
          data-room-lobby-ai-remove={participant.playerId}
        >
          {copy.removeAiAction}
        </button>
      ) : null}
    </li>
  );
}

export function RoomLobbyBadge({ label }: { label: string }) {
  return <span data-room-lobby-badge="true">{label}</span>;
}

export function RoomLobbyActions({
  copy,
  onAddAi,
  onReady,
  onRoomShare,
  onStart,
  roomShareAvailable,
  roomShareLabel,
  view,
}: {
  copy: PokeLoungeCopy["lobby"];
  onAddAi(): void;
  onReady(): void;
  onRoomShare(): void;
  onStart(): void;
  roomShareAvailable: boolean;
  roomShareLabel: string;
  view: ReturnType<typeof createRoomLobbyViewState>;
}) {
  return (
    <footer className="room-lobby-footer" data-room-lobby-actions="true">
      <button
        type="button"
        disabled={view.readyDisabled}
        onClick={onReady}
        data-room-lobby-ready="true"
      >
        {view.ownReady ? copy.cancelReadyAction : copy.readyAction}
      </button>
      {roomShareAvailable ? (
        <button type="button" onClick={onRoomShare} data-room-lobby-share="true">
          {roomShareLabel}
        </button>
      ) : null}
      {view.isHost ? (
        <>
          <button
            type="button"
            disabled={view.participantCount >= 8 || view.startDisabledReason === "mutation"}
            onClick={onAddAi}
            data-room-lobby-ai-add="true"
          >
            {copy.addAiAction}
          </button>
          <button
            type="button"
            disabled={view.startDisabledReason !== null}
            onClick={onStart}
            data-room-lobby-start="true"
          >
            {copy.startAction}
          </button>
        </>
      ) : null}
      <p className="room-lobby-auto-fill-notice" data-room-lobby-auto-fill-notice="true">
        {copy.autoFillNotice}
      </p>
    </footer>
  );
}

export function RoomLobbyStatus({
  errorMessage,
  status,
}: {
  errorMessage: string;
  status: string;
}) {
  return (
    <>
      <p className="room-lobby-status" aria-live="polite" data-room-lobby-status="true">
        {status}
      </p>
      <p className="room-lobby-error" data-room-lobby-error="true" aria-live="assertive">
        {errorMessage}
      </p>
    </>
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
