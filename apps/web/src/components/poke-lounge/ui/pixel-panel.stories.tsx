import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import { PixelPanel } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Pixel Panel",
  component: PixelPanel,
  tags: ["autodocs"],
  args: {
    children: "게임 정보를 담는 패널",
    style: { width: 320, padding: 20 },
  },
  argTypes: {
    children: { control: "text" },
  },
  parameters: {
    layout: "centered",
    controls: { include: ["children"] },
    docs: {
      description: {
        component: "HP, 상태, 메뉴처럼 경계가 필요한 정보를 담는 공용 패널입니다.",
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
} satisfies Meta<typeof PixelPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
