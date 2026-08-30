import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";

type RoomLobbyMutation = "ready" | "start" | null;

export interface RoomLobbyViewState {
  participantCount: number;
  ownReady: boolean;
  ownPartyReady: boolean;
  isHost: boolean;
  readyDisabled: boolean;
  startDisabledReason: "players" | "connection" | "party" | "ready" | "mutation" | null;
}

export interface RoomLobbyScreen {
  update(projection: TournamentStateRoomPayload): void;
  destroy(): void;
}

interface CreateRoomLobbyScreenOptions {
  mount: HTMLElement;
  copy: PokeLoungeCopy["lobby"];
  projection: TournamentStateRoomPayload;
  onSetReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
}

export function createRoomLobbyViewState(
  projection: TournamentStateRoomPayload,
  mutation: RoomLobbyMutation = null,
): RoomLobbyViewState {
  const participants = projection.participants.filter(
    participant => participant.role === "participant",
  );
  const ownParticipant = participants.find(
    participant => participant.playerId === projection.ownPlayerId,
  );
  const startDisabledReason =
    mutation !== null
      ? "mutation"
      : participants.length < 2
        ? "players"
        : participants.some(participant => !participant.connected)
          ? "connection"
          : participants.some(participant => !participant.partyReady)
            ? "party"
            : participants.some(participant => !participant.ready)
              ? "ready"
              : null;

  return {
    participantCount: participants.length,
    ownReady: ownParticipant?.ready ?? false,
    ownPartyReady: ownParticipant?.partyReady ?? false,
    isHost: projection.hostPlayerId === projection.ownPlayerId,
    readyDisabled: mutation !== null || !ownParticipant?.connected || !ownParticipant.partyReady,
    startDisabledReason,
  };
}

export function createRoomLobbyScreen({
  mount,
  copy,
  projection: initialProjection,
  onSetReady,
  onStart,
}: CreateRoomLobbyScreenOptions): RoomLobbyScreen {
  const documentRef = mount.ownerDocument;
  const gamePage = mount.closest<HTMLElement>("[data-poke-lounge-mobile-shell]");
  const screen = documentRef.createElement("section");
  screen.className = "room-lobby-screen";
  screen.dataset.roomLobby = "true";
  screen.setAttribute("aria-labelledby", "room-lobby-title");
  mount.dataset.roomLobbyOpen = "true";
  gamePage?.setAttribute("data-poke-lounge-room-lobby-open", "true");
  const panel = documentRef.createElement("div");
  panel.className = "room-lobby-panel";
  screen.append(panel);
  mount.append(screen);

  let projection = initialProjection;
  let mutation: RoomLobbyMutation = null;
  let errorMessage = "";

  const runMutation = async (
    kind: Exclude<RoomLobbyMutation, null>,
    action: () => Promise<void>,
  ) => {
    if (mutation) {
      return;
    }

    mutation = kind;
    errorMessage = "";
    render();
    try {
      await action();
    } catch {
      errorMessage = copy.mutationFailed;
    } finally {
      mutation = null;
      render();
    }
  };

  const render = () => {
    const view = createRoomLobbyViewState(projection, mutation);
    panel.replaceChildren();

    const header = documentRef.createElement("header");
    header.className = "room-lobby-header";
    const title = documentRef.createElement("h2");
    title.id = "room-lobby-title";
    title.textContent = copy.title;
    const count = documentRef.createElement("p");
    count.textContent = copy.participantCount(view.participantCount);
    header.append(title, count);

    const list = documentRef.createElement("ul");
    list.className = "room-lobby-participants";
    list.dataset.roomLobbyParticipants = "true";
    list.tabIndex = 0;
    list.setAttribute("aria-label", copy.participantListLabel);
    list.addEventListener("keydown", event => {
      if (event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      list.scrollTop = event.key === "Home" ? 0 : list.scrollHeight;
    });
    for (const participant of projection.participants) {
      const item = documentRef.createElement("li");
      item.className = "room-lobby-participant";
      item.dataset.playerId = participant.playerId;
      const name = documentRef.createElement("strong");
      name.textContent = participant.displayName;
      const badges = documentRef.createElement("span");
      badges.className = "room-lobby-badges";
      const labels = [
        participant.playerId === projection.hostPlayerId ? copy.hostBadge : null,
        participant.ready ? copy.ready : copy.notReady,
        participant.connected ? copy.connected : copy.disconnected,
        participant.partyReady ? copy.partyReady : copy.partyMissing,
      ].filter((label): label is string => Boolean(label));
      for (const label of labels) {
        const badge = documentRef.createElement("span");
        badge.textContent = label;
        badges.append(badge);
      }
      item.append(name, badges);
      list.append(item);
    }

    const footer = documentRef.createElement("footer");
    footer.className = "room-lobby-footer";
    const readyButton = documentRef.createElement("button");
    readyButton.type = "button";
    readyButton.dataset.roomLobbyReady = "true";
    readyButton.disabled = view.readyDisabled;
    readyButton.textContent = view.ownReady ? copy.cancelReadyAction : copy.readyAction;
    readyButton.addEventListener("click", () => {
      void runMutation("ready", () => onSetReady(!view.ownReady));
    });
    footer.append(readyButton);

    const status = documentRef.createElement("p");
    status.className = "room-lobby-status";
    status.setAttribute("aria-live", "polite");
    if (!view.ownPartyReady) {
      status.textContent = copy.ownPartyMissingReason;
    }

    if (view.isHost) {
      const startButton = documentRef.createElement("button");
      startButton.type = "button";
      startButton.dataset.roomLobbyStart = "true";
      startButton.disabled = view.startDisabledReason !== null;
      startButton.textContent = copy.startAction;
      startButton.addEventListener("click", () => {
        void runMutation("start", onStart);
      });
      footer.append(startButton);
      status.textContent = view.startDisabledReason
        ? copy.startDisabledReason[view.startDisabledReason]
        : copy.hostReady;
    } else if (!status.textContent) {
      status.textContent = copy.guestWaiting;
    }

    const error = documentRef.createElement("p");
    error.className = "room-lobby-error";
    error.dataset.roomLobbyError = "true";
    error.setAttribute("aria-live", "assertive");
    error.textContent = errorMessage;
    panel.append(header, list, footer, status, error);
  };

  render();

  return {
    update(nextProjection) {
      projection = nextProjection;
      render();
    },
    destroy() {
      screen.remove();
      delete mount.dataset.roomLobbyOpen;
      gamePage?.removeAttribute("data-poke-lounge-room-lobby-open");
    },
  };
}
