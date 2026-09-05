import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PokeLoungePartySlotMenu } from "./party-slot-menu";
import { PokeLoungeGameFrame } from "./poke-lounge-game-frame";
import {
  PokeLoungeDecisionDialogs,
  PokeLoungeHydrationScreens,
  PokeLoungeNoticeBanner,
  PokeLoungeResultPanel,
  PokeLoungeStartupErrorScreen,
  PokeLoungeStatusRail,
} from "./poke-lounge-game-overlays";
import { PokeLoungeSettingsDialog } from "./poke-lounge-settings-dialog";
import styles from "./poke-lounge.module.css";
import themeStyles from "./poke-lounge-theme.module.css";
import { storyCopy, storyNoop, storyParty } from "./poke-lounge-story-fixtures";

const meta = {
  title: "Poke Lounge/Screens/Game Shell",
  parameters: { layout: "fullscreen" },
  decorators: [
    function callback(Story) {
      return (
        <main className={`${styles.page} ${themeStyles.theme}`} style={{ minHeight: "100vh" }}>
          <Story />
        </main>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GameFrame: Story = {
  render: () => (
    <PokeLoungeGameFrame
      copy={storyCopy}
      gameRuntimeMounted
      roomShareAvailable
      roomShareStatus="idle"
      runtimeState={{
        phase: "entry",
        screen: "direct-multiplayer",
        currentUrl: new URL("http://localhost/ko-KR/game/poke-lounge"),
        initialDisplayName: "트레이너",
        onSubmit: storyNoop,
      }}
      touchGameDevice={false}
      onOpenSettings={storyNoop}
      onRoomShare={storyNoop}
    />
  ),
};

export const PartySlots: Story = {
  render: () => (
    <div style={{ width: 420, padding: 24 }}>
      <PokeLoungePartySlotMenu copy={storyCopy} party={storyParty} />
    </div>
  ),
};

export const HydrationLoading: Story = {
  render: () => (
    <PokeLoungeHydrationScreens
      copy={storyCopy}
      message="저장 데이터를 불러오는 중입니다."
      status="pending"
      touchGameDevice={false}
      onRetry={storyNoop}
    />
  ),
};

export const HydrationUnavailable: Story = {
  render: () => (
    <PokeLoungeHydrationScreens
      copy={storyCopy}
      message="저장 데이터를 불러오지 못했습니다."
      status="unavailable"
      touchGameDevice={false}
      onRetry={storyNoop}
    />
  ),
};

export const StartupError: Story = {
  render: () => (
    <PokeLoungeStartupErrorScreen
      copy={storyCopy}
      touchGameDevice={false}
      onRetry={storyNoop}
      onLobby={storyNoop}
    />
  ),
};

export const StatusRail: Story = {
  render: () => (
    <PokeLoungeStatusRail
      authenticated
      autosaveLabel="방금 저장됨"
      autosaveStatus="saved"
      connectionLabel="온라인 · ROOM01"
      connectionStatus="online"
      copy={storyCopy}
      hydrationMessage="로컬 저장 데이터를 사용 중입니다."
      hydrationRetryDisabled={false}
      hydrationRetryLabel="다시 연결"
      multiplayer
      usingLocalHydrationFallback
      onRetryHydration={storyNoop}
    />
  ),
};

export const NoticeBanners: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12, padding: 24 }}>
      {(["info", "success", "warning", "error"] as const).map(function mapItem(tone) {
        return (
          <PokeLoungeNoticeBanner
            key={tone}
            copy={storyCopy}
            message={`${tone} 알림 메시지`}
            tone={tone}
            onClose={storyNoop}
          />
        );
      })}
    </div>
  ),
};

export const Result: Story = {
  render: () => (
    <PokeLoungeResultPanel
      copy={storyCopy}
      playTime={754}
      returnsToRoomEntry={false}
      score={1_240}
      touchGameDevice={false}
      onLobby={storyNoop}
      onRetry={storyNoop}
    />
  ),
};

export const Settings: Story = {
  render: () => (
    <PokeLoungeSettingsDialog
      autosaveLabel="방금 저장됨"
      connectionLabel="온라인 · ROOM01"
      copy={storyCopy}
      fullscreenActive={false}
      localRoomShare={false}
      multiplayer
      open
      party={storyParty}
      roomShareAvailable
      roomShareStatus="idle"
      roomLeaveLabel="방 나가기"
      uiSize="normal"
      uiSizeLabel="UI 크기: 보통"
      volumeAriaLabel="볼륨 20%"
      volumeLabel="볼륨 20%"
      volumeLevelIndex={1}
      onExit={storyNoop}
      onFullscreenToggle={storyNoop}
      onOpenChange={storyNoop}
      onRoomShare={storyNoop}
      onUiSizeToggle={storyNoop}
      onVolumeCycle={storyNoop}
    />
  ),
};

export const HydrationConflictDialog: Story = {
  render: () => (
    <PokeLoungeDecisionDialogs
      copy={storyCopy}
      exitOpen={false}
      hydrationConflictOpen
      leaveRequest={null}
      touchGameDevice={false}
      onDeferHydration={storyNoop}
      onExitConfirm={storyNoop}
      onExitOpenChange={storyNoop}
      onHydrationOpenChange={storyNoop}
      onLeaveOpenChange={storyNoop}
      onUseLocalHydration={storyNoop}
      onUseServerHydration={storyNoop}
    />
  ),
};

export const ExitDialog: Story = {
  render: () => (
    <PokeLoungeDecisionDialogs
      copy={storyCopy}
      exitOpen
      hydrationConflictOpen={false}
      leaveRequest={null}
      touchGameDevice={false}
      onDeferHydration={storyNoop}
      onExitConfirm={storyNoop}
      onExitOpenChange={storyNoop}
      onHydrationOpenChange={storyNoop}
      onLeaveOpenChange={storyNoop}
      onUseLocalHydration={storyNoop}
      onUseServerHydration={storyNoop}
    />
  ),
};

export const LeaveRoomDialog: Story = {
  render: () => (
    <PokeLoungeDecisionDialogs
      copy={storyCopy}
      exitOpen={false}
      hydrationConflictOpen={false}
      leaveRequest={{
        title: "진행 중인 방을 나갈까요?",
        description: "현재 라운드에서 제외됩니다.",
        confirm: storyNoop,
      }}
      touchGameDevice={false}
      onDeferHydration={storyNoop}
      onExitConfirm={storyNoop}
      onExitOpenChange={storyNoop}
      onHydrationOpenChange={storyNoop}
      onLeaveOpenChange={storyNoop}
      onUseLocalHydration={storyNoop}
      onUseServerHydration={storyNoop}
    />
  ),
};
