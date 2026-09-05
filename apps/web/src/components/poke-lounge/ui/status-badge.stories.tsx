import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import { StatusBadge } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Status Badge",
  component: StatusBadge,
  tags: ["autodocs"],
  args: {
    children: "온라인",
    tone: "green",
  },
  argTypes: {
    children: { control: "text" },
    tone: {
      control: "radio",
      options: ["green", "gold", "blue", "danger"],
    },
  },
  parameters: {
    layout: "centered",
    controls: { include: ["children", "tone"] },
    docs: {
      description: {
        component: "연결, 점수, 라운드, 오류처럼 짧은 상태를 구분하는 배지입니다.",
      },
    },
  },
  decorators: [
    function withPokeLoungeTheme(Story) {
      return (
        <div className={themeStyles.theme} style={{ fontFamily: "var(--pl-font-game)" }}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};

export const Score: Story = {
  args: { children: "1,240점", tone: "gold" },
};

export const Round: Story = {
  args: { children: "라운드 3", tone: "blue" },
};

export const Disconnected: Story = {
  args: { children: "연결 끊김", tone: "danger" },
};
