import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import styles from "../../../poke-lounge.module.css";
import themeStyles from "../../../poke-lounge-theme.module.css";
import {
  storyCopy,
  storyLobbyProjection,
  storyTournamentProjection,
} from "../../../poke-lounge-story-fixtures";
import { TournamentBracketPanel } from "./tournament-bracket-panel";

const meta = {
  title: "Poke Lounge/Components/Tournament Bracket",
  component: TournamentBracketPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { include: ["text"] },
    docs: {
      description: {
        component: "토너먼트 대진, 내 위치, 다음 전투까지 남은 시간을 보여주는 패널입니다.",
      },
    },
  },
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
} satisfies Meta<typeof TournamentBracketPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bracket: Story = {
  args: {
    copy: storyCopy,
    projection: storyTournamentProjection,
    text: "토너먼트 대진표가 확정되었습니다.",
  },
};

export const WaitingForBracket: Story = {
  args: {
    copy: storyCopy,
    projection: storyLobbyProjection,
    text: "다른 트레이너를 기다리는 중입니다.",
  },
};
