import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import styles from "../poke-lounge.module.css";
import themeStyles from "../poke-lounge-theme.module.css";
import {
  createStoryBattleUiStore,
  storyBattleControls,
  storyBattlePresentation,
  storyCopy,
  storyMobileWorldState,
  storyNoop,
  storyParty,
} from "../poke-lounge-story-fixtures";
import { createWorldUiStore } from "../runtime/game/world/world-ui-store";
import type { MobileBattleUiState } from "../runtime/game/ui/mobile-battle-ui";
import { MobileGameShell, MobileWorldScreen } from "./mobile-game-shell";
import { BattleScreen } from "../runtime/game/battle/battle-screen";
import type { BattlePresentationState } from "../runtime/game/battle/battle-ui-store";

const meta = {
  title: "Poke Lounge/Screens/Mobile",
  parameters: { layout: "fullscreen" },
  decorators: [
    function callback(Story) {
      return (
        <main
          data-testid="poke-lounge-page"
          data-poke-lounge-play-layout="true"
          className={`${styles.page} ${styles.touchGameDevice} ${themeStyles.theme}`}
          style={{ width: "100%", maxWidth: 390, margin: "0 auto" }}
        >
          <Story />
        </main>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const settings = {
  autosaveLabel: "방금 저장됨",
  connectionLabel: "온라인 · ROOM01",
  hydrationFallbackMessage: null,
  hydrationRetryDisabled: false,
  hydrationRetryLabel: "다시 연결",
  localRoomShare: false,
  onClose: storyNoop,
  onExit: storyNoop,
  onRetryHydration: storyNoop,
  onRoomShare: storyNoop,
  onVolumeCycle: storyNoop,
  open: false,
  partySlots: storyParty,
  roomShareAvailable: true,
  roomShareStatus: "idle" as const,
  roomLeaveLabel: "방 나가기",
  volumeAriaLabel: "볼륨 20%",
  volumeLabel: "볼륨 20%",
};

function createStoryWorldUiStore() {
  const store = createWorldUiStore();
  store.publishMobile(storyMobileWorldState);
  return store;
}

function renderWorldSurface(screen: typeof storyMobileWorldState.screen, title: string) {
  return (
    <MobileWorldScreen
      copy={storyCopy}
      onAction={storyNoop}
      state={{ ...storyMobileWorldState, screen, title }}
    />
  );
}

function renderBattleDeck(
  overrides: Partial<MobileBattleUiState>,
  presentationOverrides: Partial<BattlePresentationState> = {},
) {
  const controls = { ...storyBattleControls, ...overrides };
  const uiStore = createStoryBattleUiStore(
    {
      ...storyBattlePresentation,
      phase: controls.phase,
      message: controls.message,
      ...presentationOverrides,
    },
    controls,
  );
  return (
    <>
      <div className={styles.gameFrame}>
        <BattleScreen copy={storyCopy} desktop={false} uiStore={uiStore} />
      </div>
      <MobileGameShell
        activeScene="battle"
        copy={storyCopy}
        battleUiStore={uiStore}
        settings={settings}
        onOpenSettings={storyNoop}
      />
    </>
  );
}

export const ExploreControls: Story = {
  render: () => (
    <MobileGameShell
      activeScene="world"
      copy={storyCopy}
      onOpenSettings={storyNoop}
      settings={settings}
      worldUiStore={createStoryWorldUiStore()}
    />
  ),
};

export const Settings: Story = {
  render: () => (
    <MobileGameShell
      activeScene="world"
      copy={storyCopy}
      onOpenSettings={storyNoop}
      settings={{ ...settings, open: true }}
      worldUiStore={createStoryWorldUiStore()}
    />
  ),
};

export const WorldHelp: Story = {
  render: () => renderWorldSurface("help", "도움말"),
};

export const Inventory: Story = {
  render: () => renderWorldSurface("inventory-items", "가방"),
};

export const InventoryPartyTarget: Story = {
  render: () => renderWorldSurface("inventory-party", "사용할 포켓몬"),
};

export const InventoryMoveReplacement: Story = {
  render: () => renderWorldSurface("inventory-move-replace", "기술 교체"),
};

export const Shop: Story = {
  render: () => renderWorldSurface("shop", "프렌들리 숍"),
};

export const PcBox: Story = {
  render: () => renderWorldSurface("pc", "PC 박스"),
};

export const Dice: Story = {
  render: () => renderWorldSurface("dice", "주사위 겜블"),
};

export const Party: Story = {
  render: () => renderWorldSurface("party", "파티"),
};

export const BattleCommand: Story = {
  render: () =>
    renderBattleDeck({ phase: "command", message: null, isHelpOpen: false, isInputLocked: false }),
};

export const BattleMessage: Story = {
  render: () => renderBattleDeck({ phase: "intro", message: "야생 브케인이 나타났다!" }),
};

export const BattleMoves: Story = {
  render: () => renderBattleDeck({ phase: "move-select", message: null, canGoBack: true }),
};

export const BattleMoveReplacement: Story = {
  render: () => renderBattleDeck({ phase: "move-replace-select", message: null, canGoBack: true }),
};

export const BattleParty: Story = {
  render: () => renderBattleDeck({ phase: "party-select", message: null, canGoBack: true }),
};

export const BattleBag: Story = {
  render: () => renderBattleDeck({ phase: "bag-select", message: null, canGoBack: true }),
};

export const BattleHelp: Story = {
  render: () => renderBattleDeck({ message: null, isHelpOpen: true }),
};

export const BattleWaiting: Story = {
  render: () => renderBattleDeck({ phase: "resolving", message: null, isInputLocked: true }),
};

export const BattleResult: Story = {
  render: () =>
    renderBattleDeck({ phase: "ended", message: "승리했습니다.", requiresConfirmation: true }),
};

export const Spectating: Story = {
  render: () =>
    renderBattleDeck(
      {
        phase: "resolving",
        message: storyCopy.mobile.spectating,
        spectating: true,
        isInputLocked: true,
      },
      { authoritative: { ...storyBattlePresentation.authoritative, spectating: true } },
    ),
};

export const Healing: Story = {
  render: () =>
    renderBattleDeck(
      { phase: "resolving", message: "치코리타의 체력이 회복되고 있다!", isInputLocked: true },
      { player: { ...storyBattlePresentation.player, healing: true } },
    ),
};
