import { PageReloadButton } from "../../../ui/page-reload-button";
import { RoomLobbyScreen } from "./room-lobby-view";
import { DirectMultiplayerEntryScreen } from "./room-invitation-screen";
export { RoomLobbyScreen } from "./room-lobby-view";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, Clock3, Globe2, LockKeyhole, Plus, RefreshCw, Users } from "lucide-react";
import {
  DEFAULT_ROUND_DURATION_MS,
  ROUND_DURATION_OPTIONS_MS,
} from "@poke-lounge/battle/round-settings";
import { getPokeLoungeCopyForUrl, type PokeLoungeCopy } from "../../../poke-lounge-copy";
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
import {
  fetchPublicRooms,
  type PublicRoomStatus,
  type PublicRoomSummary,
} from "../network/public-room-directory";
import { getWebRtcSignalingCopy } from "../network/web-rtc-signaling-panel";
import { StarterSelectionScreen } from "./starter-selection-screen";

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
  const [entryStep, setEntryStep] = useState<"profile" | "rooms">("profile");
  const [entryPanel, setEntryPanel] = useState<"create" | "join">("create");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [privateRoomCode, setPrivateRoomCode] = useState("");
  const [joinPrivateRoomCode, setJoinPrivateRoomCode] = useState("");
  const [roundDurationMs, setRoundDurationMs] =
    useState<(typeof ROUND_DURATION_OPTIONS_MS)[number]>(DEFAULT_ROUND_DURATION_MS);
  const selectedRoundDurationIndex = ROUND_DURATION_OPTIONS_MS.indexOf(roundDurationMs);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(false);
  const [publicRoomsError, setPublicRoomsError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(function initializePrivateRoomCode() {
    setPrivateRoomCode(function setInitialCode(currentCode) {
      return currentCode || createTemporaryPassword();
    });
  }, []);

  useEffect(
    function loadPublicRoomDirectory() {
      if (entryStep !== "rooms" || entryPanel !== "join") {
        return undefined;
      }

      const controller = new AbortController();

      setPublicRoomsLoading(true);
      setPublicRoomsError("");
      void fetchPublicRooms(controller.signal)
        .then(function handleResolved(rooms) {
          setPublicRooms(rooms);
        })
        .catch(function handleRejected(error: unknown) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setPublicRoomsError(copy.roomEntry.publicRoomsLoadFailed);
        })
        .finally(function handleSettled() {
          if (!controller.signal.aborted) {
            setPublicRoomsLoading(false);
          }
        });

      return function cleanup() {
        controller.abort();
      };
    },
    [copy.roomEntry.publicRoomsLoadFailed, entryPanel, entryStep],
  );

  const normalizeDisplayNameForAction = (): string | null => {
    const normalizedName = normalizeMultiplayerDisplayName(displayName);
    setDisplayName(normalizedName);
    if (!normalizedName) {
      setMessage(copy.roomEntry.multiplayerNameRequired);
      return null;
    }
    return normalizedName;
  };

  const handleContinueToRoomSelection = (event: FormEvent) => {
    event.preventDefault();
    if (pending) {
      return;
    }

    const normalizedName = normalizeDisplayNameForAction();
    if (!normalizedName) {
      return;
    }

    playConfirmSound();
    setMessage("");
    setEntryStep("rooms");
  };

  const handleBackToProfile = () => {
    if (pending) {
      return;
    }

    setMessage("");
    setEntryStep("profile");
  };

  const selectEntryPanel = (panel: "create" | "join") => {
    if (pending || entryPanel === panel) {
      return;
    }

    if (panel === "join") {
      setPublicRoomsLoading(true);
    }
    setEntryPanel(panel);
    setMessage("");
  };

  const handleRefreshPublicRooms = async () => {
    if (publicRoomsLoading || pending) {
      return;
    }

    setPublicRoomsLoading(true);
    setPublicRoomsError("");
    try {
      setPublicRooms(await fetchPublicRooms());
    } catch {
      setPublicRoomsError(copy.roomEntry.publicRoomsLoadFailed);
    } finally {
      setPublicRoomsLoading(false);
    }
  };

  const handleJoinPublicRoom = (room: PublicRoomSummary) => {
    if (!room.joinable || pending) {
      return;
    }

    const normalizedName = normalizeDisplayNameForAction();
    if (!normalizedName) {
      return;
    }

    playConfirmSound();
    setPending(true);
    setMessage(copy.roomEntry.preparing);
    state.onSelect({
      mode: "server-room",
      roomCode: room.roomCode,
      inviteUrl: null,
      displayName: normalizedName,
      roomInstanceId: room.roomInstanceId,
      visibility: "public",
      roundDurationMs: room.roundDurationMs,
    });
  };

  const handleCreateRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) {
      return;
    }

    const normalizedName = normalizeDisplayNameForAction();
    if (!normalizedName) {
      return;
    }

    if (roomVisibility === "public") {
      playConfirmSound();
      setPending(true);
      setMessage(copy.roomEntry.preparing);
      state.onSelect({
        mode: "server-room",
        roomCode: null,
        inviteUrl: null,
        displayName: normalizedName,
        createRoom: true,
        visibility: "public",
        roundDurationMs,
      });
      return;
    }

    const normalizedCode = normalizeTemporaryPassword(privateRoomCode);
    setPrivateRoomCode(normalizedCode);
    if (normalizedCode.length !== TEMPORARY_PASSWORD_LENGTH) {
      setMessage(copy.roomEntry.temporaryPasswordRequired);
      return;
    }

    setPending(true);
    setMessage(copy.roomEntry.preparing);
    try {
      const roomCode = await deriveTemporaryRoomCode(normalizedCode);
      playConfirmSound();
      state.onSelect({
        mode: "server-room",
        roomCode,
        inviteUrl: null,
        displayName: normalizedName,
        createRoom: true,
        visibility: "private",
        roundDurationMs,
      });
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.multiplayerConnectFailed);
    }
  };

  const handleJoinPrivateRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) {
      return;
    }

    const normalizedName = normalizeDisplayNameForAction();
    if (!normalizedName) {
      return;
    }

    const normalizedCode = normalizeTemporaryPassword(joinPrivateRoomCode);
    setJoinPrivateRoomCode(normalizedCode);
    if (normalizedCode.length !== TEMPORARY_PASSWORD_LENGTH) {
      setMessage(copy.roomEntry.temporaryPasswordRequired);
      return;
    }

    setPending(true);
    setMessage(copy.roomEntry.preparing);
    try {
      const roomCode = await deriveTemporaryRoomCode(normalizedCode);
      playConfirmSound();
      state.onSelect({
        mode: "server-room",
        roomCode,
        inviteUrl: null,
        displayName: normalizedName,
        visibility: "private",
      });
    } catch {
      setPending(false);
      setMessage(copy.roomEntry.multiplayerConnectFailed);
    }
  };

  return (
    <section
      className="grid min-h-full w-full place-items-center overflow-auto bg-[var(--rom-screen-background)] p-3 text-[#17201a]"
      data-room-entry-screen="true"
      data-local-test-mode-active={state.localTestMode?.active || undefined}
    >
      <div className="grid w-full max-w-[820px] gap-4 overflow-auto rounded-xl border-[3px] border-[#17231c] bg-[#f8fbf0] p-4 shadow-[0_8px_0_#17231c] [&_button]:min-h-10 [&_button]:rounded-md [&_button]:border-2 [&_button]:border-[#17231c] [&_button]:bg-[#fffdf0] [&_button]:px-3 [&_button]:font-black [&_button]:text-[#17201a] [&_button]:shadow-[0_3px_0_#17231c] [&_button:active]:translate-y-0.5 [&_button:active]:shadow-[0_1px_0_#17231c] [&_button:disabled]:cursor-default [&_button:disabled]:opacity-55 [&_input]:min-h-10 [&_input]:w-full [&_input]:rounded-md [&_input]:border-2 [&_input]:border-[#17231c] [&_input]:bg-[#fffef3] [&_input]:px-3 [&_input]:text-[#17201a] [&_input]:outline-none [&_input:focus-visible]:ring-2 [&_input:focus-visible]:ring-[#2f6b78]">
        {entryStep === "profile" ? (
          <header className="grid gap-4 border-b-2 border-[#8a958b] pb-4">
            <div className="flex items-center gap-3 text-xs font-black tracking-[0.14em] text-[#b88b20]">
              <span
                className="relative size-10 rounded-full border-[3px] border-[#fffdf0] bg-[linear-gradient(to_bottom,#f4cf58_0_44%,#24313b_44%_56%,#fffdf0_56%_100%)] shadow-[0_3px_0_rgb(0_0_0_/_24%)] after:absolute after:top-1/2 after:left-1/2 after:size-3 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-[#fffdf0] after:bg-[#24313b] after:content-['']"
                aria-hidden="true"
              />
              <span>POKE LOUNGE</span>
            </div>
            <div className="grid gap-2 [&_h1]:m-0 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:tracking-[-0.05em] [&_p]:m-0 [&_p]:text-sm [&_p]:font-bold [&_p]:leading-relaxed [&_p]:text-[#52615e]">
              <h1>{copy.roomEntry.title}</h1>
              <p>{copy.roomEntry.multiplayerDescription}</p>
            </div>
            <PageReloadButton locale={copy.locale} disabled={pending} />
            <FanNotice copy={copy} />
          </header>
        ) : (
          <header className="grid gap-3 border-b-2 border-[#8a958b] pb-4">
            <div className="flex items-center gap-3 text-xs font-black tracking-[0.14em] text-[#b88b20]">
              <span
                className="relative size-8 rounded-full border-[3px] border-[#fffdf0] bg-[linear-gradient(to_bottom,#f4cf58_0_44%,#24313b_44%_56%,#fffdf0_56%_100%)] shadow-[0_2px_0_rgb(0_0_0_/_24%)] after:absolute after:top-1/2 after:left-1/2 after:size-2.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border-2 after:border-[#fffdf0] after:bg-[#24313b] after:content-['']"
                aria-hidden="true"
              />
              <span>POKE LOUNGE</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="min-w-0 flex-1"
                disabled={pending}
                onClick={handleBackToProfile}
              >
                {copy.roomEntry.roomSetupBack}
              </button>
              <PageReloadButton locale={copy.locale} disabled={pending} iconOnly />
            </div>
          </header>
        )}

        {entryStep === "profile" && state.localTestMode ? (
          <section
            className="grid gap-3 rounded-lg border-2 border-[#4f653f] bg-[#eef4df] p-3 data-[local-test-mode-active]:border-[#2f6548] data-[local-test-mode-active]:bg-[#dff3e5]"
            data-room-entry-mode="solo"
            data-room-entry-local-test="true"
            data-local-test-mode-active={state.localTestMode.active || undefined}
            aria-label={copy.roomEntry.localTestTitle}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[#8a958b] pb-3 [&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-black">
              <h2>{copy.roomEntry.localTestTitle}</h2>
            </header>
            <p className="m-0 text-xs font-bold leading-[1.45] text-[#4a5b4d]">
              {copy.roomEntry.localTestDescription}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        {entryStep === "profile" && !state.localTestMode?.active ? (
          <form
            className="grid gap-4"
            onSubmit={handleContinueToRoomSelection}
            data-room-entry-profile-step
          >
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

            <button
              type="submit"
              className="flex min-h-[52px]! items-center justify-between bg-[#f4cf58]! px-4! text-left text-sm shadow-[inset_7px_0_#c9534c,0_4px_0_#17231c]!"
              disabled={pending}
              data-room-entry-profile-submit
            >
              <span>{copy.roomEntry.roomSetupStart}</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>

            <p
              className="m-0 min-h-[18px] text-sm font-black text-[#8d2f24]"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-room-entry-message="true"
            >
              {message}
            </p>
          </form>
        ) : null}

        {entryStep === "rooms" && !state.localTestMode?.active ? (
          <section
            className="grid gap-3"
            data-room-entry-mode="multiplayer"
            data-room-entry-room-step
          >
            <div
              className="grid grid-cols-2 border-b-2 border-[#17231c]"
              role="tablist"
              aria-label={copy.roomEntry.title}
              data-room-entry-tabs
            >
              <button
                id="poke-lounge-room-create-tab"
                type="button"
                role="tab"
                aria-selected={entryPanel === "create"}
                aria-controls="poke-lounge-room-create-panel"
                disabled={pending}
                className={
                  "relative -mb-0.5 flex min-h-11! items-center justify-center gap-2 rounded-none! border-0! border-b-4! px-3! text-sm shadow-none! transition-colors " +
                  (entryPanel === "create"
                    ? "border-b-[#c9534c]! bg-[#fff8dc]! text-[#17201a]!"
                    : "border-b-transparent! bg-transparent! text-[#68736c]! hover:bg-[#edf1e8]!")
                }
                onClick={() => selectEntryPanel("create")}
                data-room-entry-create-tab
              >
                <Plus className="size-4" aria-hidden="true" />
                {copy.roomEntry.roomCreateTab}
              </button>
              <button
                id="poke-lounge-room-join-tab"
                type="button"
                role="tab"
                aria-selected={entryPanel === "join"}
                aria-controls="poke-lounge-room-join-panel"
                disabled={pending}
                className={
                  "relative -mb-0.5 flex min-h-11! items-center justify-center gap-2 rounded-none! border-0! border-b-4! px-3! text-sm shadow-none! transition-colors " +
                  (entryPanel === "join"
                    ? "border-b-[#5f8f70]! bg-[#eef7ef]! text-[#17201a]!"
                    : "border-b-transparent! bg-transparent! text-[#68736c]! hover:bg-[#edf1e8]!")
                }
                onClick={() => selectEntryPanel("join")}
                data-room-entry-join-tab
              >
                <Users className="size-4" aria-hidden="true" />
                {copy.roomEntry.roomJoinTab}
              </button>
            </div>

            {entryPanel === "create" ? (
              <form
                id="poke-lounge-room-create-panel"
                role="tabpanel"
                aria-labelledby="poke-lounge-room-create-tab"
                className="grid gap-3 rounded-lg border-2 border-[#7d6741] bg-[#fff8dc] p-3 shadow-[0_4px_0_#7d6741]"
                onSubmit={handleCreateRoom}
                data-room-entry-create-panel
              >
                <fieldset
                  className="m-0 grid grid-cols-3 gap-2 border-0 p-0 [&>legend]:col-span-full"
                  disabled={pending}
                >
                  <legend className="mb-2 text-xs font-black text-[#17201a]">
                    {copy.roomEntry.roundDurationLabel}
                  </legend>
                  {ROUND_DURATION_OPTIONS_MS.map((duration, index) => (
                    <label
                      key={duration}
                      className="relative grid min-h-11 grid-cols-[auto_1fr] items-center gap-x-2 rounded-md border-2 border-[#17231c] bg-[#fffef3] px-2.5 py-1.5 text-xs font-black text-[#17201a] shadow-[0_3px_0_#8a958b] has-[:checked]:bg-[#fff1a8] has-[:checked]:shadow-[inset_6px_0_#5f8f70,0_3px_0_#17231c] [&_input]:min-h-0 [&_input]:w-auto [&_input]:p-0"
                    >
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

                <p
                  className="-mt-1 m-0 rounded-md bg-[#fff1a8] px-3 py-1.5 text-xs font-black leading-[1.45] text-[#66583a]"
                  aria-live="polite"
                  data-room-entry-round-duration-description
                >
                  {copy.roomEntry.roundDurationDescriptions[selectedRoundDurationIndex]}
                </p>

                <fieldset
                  className="m-0 grid grid-cols-2 gap-2 border-0 p-0 [&>legend]:col-span-2"
                  disabled={pending}
                >
                  <legend className="mb-1 text-xs font-black text-[#17201a]">
                    {copy.roomEntry.roomVisibilityLabel}
                  </legend>
                  <label
                    className={
                      "relative flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-[#17231c] px-3 py-1.5 text-xs font-black text-[#17201a] shadow-[0_3px_0_#8a958b] " +
                      (roomVisibility === "public"
                        ? "bg-[#dff3e5] shadow-[inset_6px_0_#5f8f70,0_3px_0_#17231c]"
                        : "bg-[#fffef3]")
                    }
                  >
                    <input
                      className="absolute min-h-0! w-px! opacity-0"
                      type="radio"
                      name="room-visibility"
                      value="public"
                      checked={roomVisibility === "public"}
                      onChange={() => {
                        setRoomVisibility("public");
                        setMessage("");
                      }}
                      data-room-entry-visibility="public"
                    />
                    <Globe2 className="size-4" aria-hidden="true" />
                    <span>{copy.roomEntry.publicGameTitle}</span>
                  </label>
                  <label
                    className={
                      "relative flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-[#17231c] px-3 py-1.5 text-xs font-black text-[#17201a] shadow-[0_3px_0_#8a958b] " +
                      (roomVisibility === "private"
                        ? "bg-[#fff1a8] shadow-[inset_6px_0_#c9534c,0_3px_0_#17231c]"
                        : "bg-[#fffef3]")
                    }
                  >
                    <input
                      className="absolute min-h-0! w-px! opacity-0"
                      type="radio"
                      name="room-visibility"
                      value="private"
                      checked={roomVisibility === "private"}
                      onChange={() => {
                        setRoomVisibility("private");
                        setMessage("");
                      }}
                      data-room-entry-visibility="private"
                    />
                    <LockKeyhole className="size-4" aria-hidden="true" />
                    <span>{copy.roomEntry.privateGameTitle}</span>
                  </label>
                </fieldset>

                <p
                  className="-mt-1 m-0 rounded-md bg-[#fffef3] px-3 py-1.5 text-xs font-bold leading-[1.45] text-[#66583a]"
                  aria-live="polite"
                  data-room-entry-visibility-description
                >
                  {roomVisibility === "public"
                    ? copy.roomEntry.publicGameDescription
                    : copy.roomEntry.privateGameDescription}
                </p>

                {roomVisibility === "private" ? (
                  <LabeledField
                    id="poke-lounge-private-room-code"
                    label={copy.roomEntry.temporaryPasswordLabel}
                    description={copy.roomEntry.temporaryPasswordDescription}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 [&_button]:w-auto [&_button]:min-w-20">
                      <input
                        id="poke-lounge-private-room-code"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        maxLength={TEMPORARY_PASSWORD_LENGTH}
                        placeholder={copy.roomEntry.temporaryPasswordPlaceholder}
                        value={privateRoomCode}
                        disabled={pending}
                        aria-invalid={
                          privateRoomCode.length !== TEMPORARY_PASSWORD_LENGTH || undefined
                        }
                        onChange={function handleChange(event) {
                          setPrivateRoomCode(normalizeTemporaryPassword(event.currentTarget.value));
                          setMessage("");
                        }}
                        data-room-entry-temporary-password
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={function handleClick() {
                          setPrivateRoomCode(createTemporaryPassword());
                          setMessage("");
                        }}
                        data-room-entry-temporary-password-generate
                      >
                        {copy.roomEntry.temporaryPasswordGenerate}
                      </button>
                    </div>
                  </LabeledField>
                ) : null}

                <button
                  type="submit"
                  className="flex min-h-[52px]! items-center justify-between bg-[#f4cf58]! px-4! text-left text-sm shadow-[inset_7px_0_#c9534c,0_4px_0_#17231c]!"
                  disabled={pending}
                  data-room-entry-public-create={roomVisibility === "public" || undefined}
                  data-room-entry-multiplayer-submit={roomVisibility === "private" || undefined}
                >
                  <span className="flex items-center gap-2">
                    {roomVisibility === "public" ? (
                      <Globe2 className="size-4" aria-hidden="true" />
                    ) : (
                      <LockKeyhole className="size-4" aria-hidden="true" />
                    )}
                    {roomVisibility === "public"
                      ? copy.roomEntry.publicRoomCreate
                      : copy.roomEntry.multiplayerConnect}
                  </span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </form>
            ) : (
              <div
                id="poke-lounge-room-join-panel"
                role="tabpanel"
                aria-labelledby="poke-lounge-room-join-tab"
                className="grid gap-4"
                data-room-entry-join-panel
              >
                <header className="grid gap-1">
                  <h2 className="m-0 text-lg font-black">{copy.roomEntry.roomJoinTab}</h2>
                  <p className="m-0 text-xs font-bold leading-[1.45] text-[#52615e]">
                    {copy.roomEntry.roomJoinDescription}
                  </p>
                </header>

                <div className="overflow-hidden rounded-lg border-2 border-[#17231c] shadow-[0_4px_0_#17231c]">
                  <form
                    className="grid gap-3 border-b-2 border-[#8a958b] bg-[#fff8dc] p-3"
                    onSubmit={handleJoinPrivateRoom}
                    data-room-entry-private-join
                  >
                    <div className="flex items-center gap-2 border-b-2 border-[#baa66b] pb-3">
                      <LockKeyhole className="size-5 shrink-0" aria-hidden="true" />
                      <h3 className="m-0 text-base font-black">
                        {copy.roomEntry.privateGameTitle}
                      </h3>
                    </div>
                    <LabeledField
                      id="poke-lounge-private-room-join-code"
                      label={copy.roomEntry.temporaryPasswordLabel}
                      description={copy.roomEntry.privateRoomJoinDescription}
                    >
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] [&_button]:sm:min-w-40">
                        <input
                          id="poke-lounge-private-room-join-code"
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          autoCapitalize="characters"
                          maxLength={TEMPORARY_PASSWORD_LENGTH}
                          placeholder={copy.roomEntry.temporaryPasswordPlaceholder}
                          value={joinPrivateRoomCode}
                          disabled={pending}
                          onChange={function handleChange(event) {
                            setJoinPrivateRoomCode(
                              normalizeTemporaryPassword(event.currentTarget.value),
                            );
                            setMessage("");
                          }}
                          data-room-entry-private-join-code
                        />
                        <button
                          type="submit"
                          className="flex items-center justify-center gap-2 bg-[#f4cf58]!"
                          disabled={pending}
                          data-room-entry-private-join-submit
                        >
                          {copy.roomEntry.privateRoomJoin}
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </LabeledField>
                  </form>

                  <section
                    className="grid min-w-0 gap-3 bg-[#e7f3f0] p-3"
                    aria-labelledby="poke-lounge-public-rooms-title"
                    data-room-entry-public-rooms
                  >
                    <header className="grid gap-2 border-b-2 border-[#7d9b99] pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Globe2 className="size-5 shrink-0" aria-hidden="true" />
                          <h3
                            id="poke-lounge-public-rooms-title"
                            className="m-0 truncate text-base font-black"
                          >
                            {copy.roomEntry.publicRoomsTitle}
                          </h3>
                        </div>
                        <button
                          type="button"
                          className="flex w-auto! shrink-0 items-center gap-1.5 px-2.5! text-xs"
                          disabled={publicRoomsLoading || pending}
                          onClick={() => void handleRefreshPublicRooms()}
                          data-room-entry-public-refresh
                        >
                          <RefreshCw
                            className={"size-4 " + (publicRoomsLoading ? "animate-spin" : "")}
                            aria-hidden="true"
                          />
                          {copy.roomEntry.publicRoomsRefresh}
                        </button>
                      </div>
                      <p className="m-0 text-xs font-bold leading-[1.45] text-[#405d5e]">
                        {copy.roomEntry.publicRoomsDescription}
                      </p>
                    </header>

                    <div
                      className="grid max-h-[320px] min-h-[110px] gap-2 overflow-y-auto pr-1"
                      aria-live="polite"
                      aria-busy={publicRoomsLoading}
                    >
                      {publicRoomsLoading && publicRooms.length === 0 ? (
                        <PublicRoomDirectoryNotice>
                          {copy.roomEntry.publicRoomsLoading}
                        </PublicRoomDirectoryNotice>
                      ) : publicRoomsError ? (
                        <PublicRoomDirectoryNotice tone="error">
                          {publicRoomsError}
                        </PublicRoomDirectoryNotice>
                      ) : publicRooms.length === 0 ? (
                        <PublicRoomDirectoryNotice>
                          {copy.roomEntry.publicRoomsEmpty}
                        </PublicRoomDirectoryNotice>
                      ) : (
                        publicRooms.map(room => (
                          <PublicRoomCard
                            key={room.roomInstanceId}
                            copy={copy}
                            room={room}
                            pending={pending}
                            onJoin={handleJoinPublicRoom}
                          />
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            <p
              className="m-0 min-h-[18px] text-sm font-black text-[#8d2f24]"
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

function PublicRoomCard({
  copy,
  room,
  pending,
  onJoin,
}: {
  copy: PokeLoungeCopy;
  room: PublicRoomSummary;
  pending: boolean;
  onJoin(room: PublicRoomSummary): void;
}) {
  const durationIndex = ROUND_DURATION_OPTIONS_MS.indexOf(room.roundDurationMs);
  const durationLabel =
    durationIndex >= 0
      ? copy.roomEntry.roundDurationOptions[durationIndex]
      : String(room.roundDurationMs);
  const statusLabel = getPublicRoomStatusLabel(copy, room.status);

  return (
    <article className="grid gap-2 rounded-md border-2 border-[#355861] bg-[#f7fffb] p-2.5 shadow-[0_2px_0_#789397] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate font-mono text-sm tracking-[0.08em]">{room.roomCode}</strong>
          <span
            className={
              "shrink-0 rounded-full border border-[#355861] px-2 py-0.5 text-[11px] font-black " +
              (room.joinable ? "bg-[#d8f0dc]" : "bg-[#e7e4dc] text-[#5d625f]")
            }
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-[#486164]">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            {copy.roomEntry.publicRoomPlayers(room.participantCount, room.maxParticipants)}
          </span>
          <span>{copy.roomEntry.publicRoomHumans(room.humanParticipantCount)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {durationLabel}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="flex w-full! items-center justify-center gap-1.5 px-3! text-xs sm:w-auto!"
        disabled={pending || !room.joinable}
        onClick={() => onJoin(room)}
        data-room-entry-public-join={room.roomCode}
      >
        {room.joinable ? copy.roomEntry.publicRoomJoin : copy.roomEntry.publicRoomUnavailable}
        {room.joinable ? <ChevronRight className="size-4" aria-hidden="true" /> : null}
      </button>
    </article>
  );
}

function PublicRoomDirectoryNotice({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={
        "grid min-h-[90px] place-items-center rounded-md border-2 border-dashed p-3 text-center text-xs font-bold leading-[1.5] " +
        (tone === "error"
          ? "border-[#b86c61] bg-[#fff0eb] text-[#8d2f24]"
          : "border-[#91aaa7] bg-[#f6fbf8] text-[#526866]")
      }
    >
      {children}
    </div>
  );
}

function getPublicRoomStatusLabel(copy: PokeLoungeCopy, status: PublicRoomStatus): string {
  switch (status) {
    case "waiting":
      return copy.roomEntry.publicRoomStatusWaiting;
    case "round-started":
      return copy.roomEntry.publicRoomStatusRoundStarted;
    case "tournament":
      return copy.roomEntry.publicRoomStatusTournament;
    default:
      return copy.roomEntry.publicRoomUnavailable;
  }
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
      className="grid h-full min-h-0 w-full place-items-center overflow-auto bg-[var(--rom-screen-background)] p-4 text-[#17201a]"
      role="status"
      aria-live="polite"
      data-game-runtime-loading="true"
    >
      <div className="grid w-full max-w-[440px] gap-3 rounded-lg border-[3px] border-[#17231c] bg-[#f8fbf0] p-5 shadow-[0_8px_0_#17231c] [&_progress]:w-full">
        <h1>Poke Lounge</h1>
        <p className="m-0 text-xs font-bold leading-[1.45] text-[#4a5b4d]">
          {copy.game.resourcesPreparing}
        </p>
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
      className="grid h-full min-h-0 w-full place-items-center overflow-auto bg-[var(--rom-screen-background)] p-4 text-[#17201a]"
      role="alert"
      aria-live="assertive"
      data-game-startup-error="true"
      data-testid="poke-lounge-startup-error"
    >
      <div className="grid w-full max-w-[440px] gap-3 rounded-lg border-[3px] border-[#17231c] bg-[#f8fbf0] p-5 shadow-[0_8px_0_#17231c] [&_progress]:w-full">
        <h1>{copy.startup.title}</h1>
        <p className="m-0 text-xs font-bold leading-[1.45] text-[#4a5b4d]">
          {state.description || copy.startup.description}
        </p>
        <div
          className="grid grid-cols-2 gap-2 [&_button]:min-h-10 [&_button]:rounded-md [&_button]:border-2 [&_button]:border-[#17231c] [&_button]:font-black"
          data-game-startup-error-actions="true"
        >
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
    <section
      className="absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] z-45 grid max-h-[min(260px,calc(100dvh-24px))] w-[min(320px,calc(100%-24px))] gap-1.5 overflow-auto rounded-md border-[3px] border-[#17231c] bg-[rgb(248_251_240_/_94%)] p-2.5 text-xs font-black text-[#17201a] shadow-[0_5px_0_rgb(23_35_28_/_86%)]"
      data-webrtc-signaling-panel="true"
    >
      <strong>WebRTC {room.sessionId}</strong>
      <span className="text-[#607d6c]" role="status" aria-live="polite" data-webrtc-status="true">
        {status}
      </span>
      <textarea
        className="min-h-[46px] w-full resize-y rounded border-2 border-[#314236] bg-[#fffef3] p-1 font-[inherit] text-[#17201a]"
        value={localSignal}
        readOnly
        placeholder={copy.localSignal}
        data-webrtc-local-signal="true"
      />
      <textarea
        className="min-h-[46px] w-full resize-y rounded border-2 border-[#314236] bg-[#fffef3] p-1 font-[inherit] text-[#17201a]"
        value={remoteSignal}
        disabled={processing}
        placeholder={copy.remoteSignal}
        onChange={function handleChange(event) {
          return setRemoteSignal(event.currentTarget.value);
        }}
        data-webrtc-remote-signal="true"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
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
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
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
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
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
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#ffd7d1] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
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
    <div className={`grid gap-2 ${className}`}>
      <label className="text-xs font-black text-[#17201a]" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className="m-0 text-xs font-bold leading-[1.45] text-[#4a5b4d]">{description}</p>
    </div>
  );
}

function FanNotice({ copy }: { copy: PokeLoungeCopy }) {
  return (
    <p
      className="m-0 rounded-md border-2 border-[#4f653f] bg-[#eef4df] p-2.5 text-xs font-bold leading-relaxed text-[#294123]"
      data-poke-lounge-fan-notice="true"
    >
      {copy.roomEntry.fanNotice}
    </p>
  );
}

function playConfirmSound(): void {
  void primePokeLoungeAudio();
  playPokeLoungeSfx("button-confirm");
}
