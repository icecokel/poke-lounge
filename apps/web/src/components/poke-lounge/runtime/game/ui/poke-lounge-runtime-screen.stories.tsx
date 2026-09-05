import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import styles from "../../../poke-lounge.module.css";
import themeStyles from "../../../poke-lounge-theme.module.css";
import {
  createStoryBattleUiStore,
  storyAsyncNoop,
  storyBootstrap,
  storyCopy,
  storyLobbyProjection,
  storyNoop,
} from "../../../poke-lounge-story-fixtures";
import type { WebRtcRoom } from "../network/web-rtc-room";
import { PokeLoungeRuntimeControls, PokeLoungeRuntimeScreen } from "./poke-lounge-runtime-screen";

const meta = {
  title: "Poke Lounge/Screens/Runtime",
  parameters: { layout: "fullscreen" },
  decorators: [
    function callback(Story) {
      return (
        <main className={`${styles.page} ${themeStyles.theme}`} style={{ minHeight: "100vh" }}>
          <div className={styles.runtimeScreen} data-poke-lounge-runtime-screen="true">
            <Story />
          </div>
        </main>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const commonProps = {
  roomShareAvailable: true,
  roomShareLabel: storyCopy.settingsShare,
  onRoomShare: storyNoop,
};

export const CreateRoom: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{
        phase: "entry",
        screen: "room",
        currentUrl: new URL("http://localhost/ko-KR/game/poke-lounge"),
        initialDisplayName: "새싹 트레이너",
        onSelect: storyNoop,
      }}
    />
  ),
};

export const JoinRoom: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{
        phase: "entry",
        screen: "direct-multiplayer",
        currentUrl: new URL("http://localhost/ko-KR/game/poke-lounge?network=server"),
        initialDisplayName: "새싹 트레이너",
        onSubmit: storyNoop,
      }}
    />
  ),
};

export const StarterSelection: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{ phase: "starter", bootstrap: storyBootstrap, onSelect: storyNoop }}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{ phase: "loading", progress: { loaded: 7, total: 10, ratio: 0.7 } }}
    />
  ),
};

export const Error: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{
        phase: "error",
        description: "게임 데이터를 불러오지 못했습니다.",
        onRetry: storyNoop,
        onReturnToEntry: storyNoop,
      }}
    />
  ),
};

export const Lobby: Story = {
  render: () => (
    <PokeLoungeRuntimeScreen
      {...commonProps}
      state={{
        phase: "lobby",
        battle: { uiStore: createStoryBattleUiStore() },
        projection: storyLobbyProjection,
        onSetReady: storyAsyncNoop,
        onStart: storyAsyncNoop,
        onAddAi: storyAsyncNoop,
        onRemoveAi: storyAsyncNoop,
      }}
    />
  ),
};

const webRtcRoom = {
  roomId: "webrtc",
  sessionId: "webrtc-01",
  connect: storyNoop,
  setLobbyReady: storyAsyncNoop,
  startChampionship: storyAsyncNoop,
  addAiParticipant: storyAsyncNoop,
  removeAiParticipant: storyAsyncNoop,
  dispose: storyNoop,
  send: storyNoop,
  on: () => storyNoop,
  createOfferSignal: async () => "offer-signal",
  acceptOfferSignal: async () => "answer-signal",
  acceptAnswerSignal: storyAsyncNoop,
} satisfies WebRtcRoom;

export const WebRtcSignaling: Story = {
  render: () => (
    <PokeLoungeRuntimeControls
      state={{
        phase: "battle",
        battle: { uiStore: createStoryBattleUiStore() },
        webRtc: { room: webRtcRoom, onLeave: storyNoop },
      }}
    />
  ),
};
