import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import { HealthBar } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Health Bar",
  component: HealthBar,
  tags: ["autodocs"],
  args: {
    "aria-label": "HP 75%",
    value: 0.75,
    style: { width: 320 },
  },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
  },
  parameters: {
    layout: "centered",
    controls: { include: ["value"] },
    docs: {
      description: {
        component: "HP 비율에 따라 정상, 주의, 위험 색상을 자동으로 표시하는 meter입니다.",
      },
    },
  },
  decorators: [
    function withPokeLoungeTheme(Story) {
      return (
        <div className={themeStyles.theme}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof HealthBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const Warning: Story = {
  args: { "aria-label": "HP 40%", value: 0.4 },
};

export const Danger: Story = {
  args: { "aria-label": "HP 15%", value: 0.15 },
};
