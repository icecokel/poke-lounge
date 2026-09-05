import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Image from "next/image";

import themeStyles from "../poke-lounge-theme.module.css";
import { PokemonSlot } from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/Components/Pokemon Slot",
  component: PokemonSlot,
  tags: ["autodocs"],
  args: {
    active: true,
    disabled: false,
    emptyLabel: "빈 슬롯",
    hp: { current: 45, max: 52, ratio: 45 / 52 },
    level: 18,
    name: "치코리타",
    selected: false,
    sprite: (
      <Image
        alt=""
        height={42}
        src="/assets/pokemon/front/152.png"
        width={42}
      />
    ),
    status: "normal",
    style: { width: 320 },
  },
  argTypes: {
    active: { control: "boolean" },
    disabled: { control: "boolean" },
    hp: { control: "object" },
    level: { control: "number" },
    name: { control: "text" },
    selected: { control: "boolean" },
    status: { control: "text" },
  },
  parameters: {
    layout: "centered",
    controls: {
      include: ["name", "level", "hp", "status", "active", "selected", "disabled"],
    },
    docs: {
      description: {
        component: "파티와 교체 화면에서 포켓몬의 선택, HP, 상태를 함께 보여주는 슬롯입니다.",
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
} satisfies Meta<typeof PokemonSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const SelectedAndBurned: Story = {
  args: {
    active: false,
    hp: { current: 12, max: 46, ratio: 12 / 46 },
    level: 17,
    name: "브케인",
    selected: true,
    sprite: (
      <Image
        alt=""
        height={42}
        src="/assets/pokemon/front/155.png"
        width={42}
      />
    ),
    status: "화상",
  },
};

export const Empty: Story = {
  args: {
    active: false,
    disabled: true,
    hp: undefined,
    level: undefined,
    name: undefined,
    sprite: undefined,
    status: null,
  },
};
