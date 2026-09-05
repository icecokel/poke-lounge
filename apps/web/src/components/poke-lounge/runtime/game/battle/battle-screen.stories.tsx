import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import styles from "../../../poke-lounge.module.css";
import themeStyles from "../../../poke-lounge-theme.module.css";
import {
  createStoryBattleUiStore,
  storyBattleControls,
  storyBattlePresentation,
  storyCopy,
} from "../../../poke-lounge-story-fixtures";
import type { MobileBattleUiState } from "../ui/mobile-battle-ui";
import type { BattlePresentationState } from "./battle-ui-store";
import { BattleScreen } from "./battle-screen";

const meta = {
  title: "Poke Lounge/Screens/Battle",
  parameters: { layout: "fullscreen" },
  decorators: [
    function callback(Story) {
      return (
        <main className={`${styles.page} ${themeStyles.theme}`} style={{ minHeight: "100vh" }}>
          <div className={styles.gameFrame}>
            <Story />
          </div>
        </main>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function renderBattle({
  controls: controlOverrides,
  presentation: presentationOverrides,
}: {
  controls?: Partial<MobileBattleUiState>;
  presentation?: Partial<BattlePresentationState>;
} = {}) {
  const controls = { ...storyBattleControls, ...controlOverrides };
  const presentation = { ...storyBattlePresentation, ...presentationOverrides };
  const uiStore = createStoryBattleUiStore(presentation, controls);

  return <BattleScreen copy={storyCopy} desktop uiStore={uiStore} />;
}

export const Command: Story = {
  render: () => renderBattle(),
};

export const Message: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "intro", message: "야생 브케인이 나타났다!" },
      presentation: { phase: "intro", message: "야생 브케인이 나타났다!" },
    }),
};

export const MoveSelection: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "move-select", canGoBack: true },
      presentation: { phase: "move-select" },
    }),
};

export const MoveReplacement: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "move-replace-select", canGoBack: true },
      presentation: { phase: "move-replace-select" },
    }),
};

export const PartySelection: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "party-select", canGoBack: true },
      presentation: { phase: "party-select" },
    }),
};

export const BagSelection: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "bag-select", canGoBack: true },
      presentation: { phase: "bag-select" },
    }),
};

export const Waiting: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "resolving", isInputLocked: true },
      presentation: { phase: "resolving" },
    }),
};

export const WaitingForReplacement: Story = {
  render: () =>
    renderBattle({
      controls: {
        phase: "resolving",
        isInputLocked: true,
        message: "상대가 다음 포켓몬을 고르고 있습니다...",
      },
      presentation: {
        phase: "resolving",
        message: "상대가 다음 포켓몬을 고르고 있습니다...",
        opponent: {
          ...storyBattlePresentation.opponent,
          displayedHp: 0,
          currentHp: 0,
          status: "fainted",
        },
        authoritative: { ...storyBattlePresentation.authoritative, inputPending: true },
      },
    }),
};

export const ShortcutGuide: Story = {
  render: () =>
    renderBattle({
      controls: { isHelpOpen: true, isInputLocked: true },
      presentation: { help: { inputMode: "keyboard", open: true } },
    }),
};

export const Capture: Story = {
  render: () =>
    renderBattle({
      presentation: {
        capture: {
          ballItemId: "pokeball",
          ballRotation: 0.35,
          ballX: 162,
          ballY: 76,
          caught: true,
          resultProgress: 0.55,
          showBall: true,
        },
      },
    }),
};

export const Evolution: Story = {
  render: () =>
    renderBattle({
      presentation: {
        evolution: {
          flashAlpha: 0.15,
          progress: 0.62,
          silhouetteAlpha: 0.65,
          sprite: {
            ...storyBattlePresentation.player.sprite,
            x: 128,
            y: 82,
          },
        },
      },
    }),
};

export const Entrance: Story = {
  render: () =>
    renderBattle({
      controls: { phase: "intro", isInputLocked: true },
      presentation: { phase: "intro", entrance: { active: true, progress: 0.42 } },
    }),
};

export const TrainerSendOut: Story = {
  render: () => renderBattle({ presentation: { battleKind: "trainer" } }),
};

export const WildEncounter: Story = {
  render: () => renderBattle({ presentation: { battleKind: "wild" } }),
};

export const Healing: Story = {
  render: () =>
    renderBattle({
      controls: { isInputLocked: true },
      presentation: {
        player: { ...storyBattlePresentation.player, healing: true },
        message: "치코리타의 체력이 회복되고 있다!",
      },
    }),
};

export const Spectating: Story = {
  render: () =>
    renderBattle({
      controls: { isInputLocked: true },
      presentation: {
        message: storyCopy.mobile.spectating,
        authoritative: { ...storyBattlePresentation.authoritative, spectating: true },
      },
    }),
};
