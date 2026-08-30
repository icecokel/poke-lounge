import type { GameBootstrapData, StarterPokemon } from "../types";
import type { RoomEntrySelection } from "./network/roomEntryScreen";
import type { WebRtcRoom } from "./network/webRtcRoom";
import type { RoomLobbyRuntimeState } from "./ui/room-lobby-screen";
import type { WorldFrameStore } from "./world/world-frame-store";
import type { WorldMapModel, WorldPlayerAtlasModel } from "./world/world-map-model";
import type { WorldUiStore } from "./world/world-ui-store";
import type { GameStateStore } from "./state/gameStateStore";
import type { VirtualGamepadController } from "./input/virtualGamepad";
import type { BattleUiStore } from "./battle/battle-ui-store";

interface PokeLoungeGameplayRuntimeControls {
  battle: {
    uiStore: BattleUiStore;
  };
  roomLeave?: {
    label: string;
    onRequest(): void;
  };
  webRtc?: {
    room: WebRtcRoom;
    onLeave(): void;
  };
  world?: {
    atlas: WorldPlayerAtlasModel;
    competitiveRoundsEnabled: boolean;
    frameStore: WorldFrameStore;
    gameStateStore: GameStateStore;
    input: VirtualGamepadController;
    model: WorldMapModel;
    uiStore: WorldUiStore;
  };
}

export type PokeLoungeGameplayRuntimeState = PokeLoungeGameplayRuntimeControls &
  ({ phase: "world" | "battle" } | ({ phase: "lobby" } & RoomLobbyRuntimeState));

export type PokeLoungeRuntimeState =
  | { phase: "hydrating" }
  | {
      phase: "entry";
      screen: "room";
      currentUrl: URL;
      initialDisplayName: string;
      localTestMode?: {
        active: boolean;
        onExit(): void;
        onStart(): void;
      };
      onSelect(selection: RoomEntrySelection): void;
    }
  | {
      phase: "entry";
      screen: "direct-multiplayer";
      currentUrl: URL;
      initialDisplayName: string;
      onSubmit(displayName: string): void;
    }
  | {
      phase: "starter";
      bootstrap: GameBootstrapData;
      onSelect(starter: StarterPokemon): void;
    }
  | {
      phase: "loading";
      progress: { loaded: number; total: number; ratio: number };
    }
  | PokeLoungeGameplayRuntimeState
  | { phase: "result" }
  | {
      phase: "error";
      description: string;
      onRetry?: () => void;
      onReturnToEntry(): void;
    };
