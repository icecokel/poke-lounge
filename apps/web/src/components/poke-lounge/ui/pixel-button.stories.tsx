import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import { PixelButton } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Pixel Button",
  component: PixelButton,
  tags: ["autodocs"],
  args: {
    children: "싸운다",
    disabled: false,
    selected: false,
    style: { minWidth: 160, padding: "12px 18px" },
  },
  argTypes: {
    children: { control: "text" },
    selected: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
    controls: { include: ["children", "selected", "disabled"] },
    docs: {
      description: {
        component: "게임의 주요 선택과 행동에 사용하는 픽셀 스타일 버튼입니다.",
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
} satisfies Meta<typeof PixelButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { selected: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};
