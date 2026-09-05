import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import { MessageBox } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Message Box",
  component: MessageBox,
  tags: ["autodocs"],
  args: {
    children: "치코리타는 무엇을 할까?",
    disabled: false,
    style: { width: 360, minHeight: 88, padding: 20 },
  },
  argTypes: {
    children: { control: "text" },
    disabled: { control: "boolean" },
  },
  parameters: {
    layout: "centered",
    controls: { include: ["children", "disabled"] },
    docs: {
      description: {
        component: "전투 메시지와 다음 진행 입력을 함께 제공하는 메시지 박스입니다.",
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
} satisfies Meta<typeof MessageBox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
