import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import themeStyles from "../poke-lounge-theme.module.css";
import {
  HealthBar,
  MessageBox,
  PixelButton,
  PixelPanel,
  PokemonSlot,
  StatusBadge,
} from "./poke-lounge-ui-primitives";

const meta = {
  title: "Poke Lounge/UI Primitives",
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    function callback(Story) {
      return (
        <div
          className={themeStyles.theme}
          style={{ minWidth: 320, color: "var(--pl-color-ink)", fontFamily: "var(--pl-font-game)" }}
        >
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <PixelButton style={{ padding: "8px 12px" }}>배틀</PixelButton>
      <PixelButton selected style={{ padding: "8px 12px" }}>
        선택됨
      </PixelButton>
      <PixelButton disabled style={{ padding: "8px 12px" }}>
        비활성
      </PixelButton>
    </div>
  ),
};

export const PanelsAndMessages: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <PixelPanel style={{ padding: 16 }}>픽셀 패널 콘텐츠</PixelPanel>
      <MessageBox style={{ minHeight: 76, padding: 16 }}>피카츄는 무엇을 할까?</MessageBox>
    </div>
  ),
};

export const HealthStates: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <HealthBar value={0.9} aria-label="높은 HP" />
      <HealthBar value={0.4} aria-label="중간 HP" />
      <HealthBar value={0.15} aria-label="낮은 HP" />
    </div>
  ),
};

export const PokemonSlots: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 12 }}>
      <PokemonSlot
        active
        emptyLabel="빈 슬롯"
        hp={{ current: 31, max: 35, ratio: 31 / 35 }}
        level={18}
        name="피카츄"
        sprite={<span aria-hidden="true">⚡</span>}
      />
      <PokemonSlot
        emptyLabel="빈 슬롯"
        hp={{ current: 7, max: 38, ratio: 7 / 38 }}
        level={20}
        name="브케인"
        selected
        sprite={<span aria-hidden="true">🔥</span>}
        status="burn"
      />
      <PokemonSlot emptyLabel="빈 슬롯" disabled />
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <StatusBadge>온라인</StatusBadge>
      <StatusBadge tone="gold">1,240원</StatusBadge>
      <StatusBadge tone="blue">라운드 3</StatusBadge>
      <StatusBadge tone="danger">연결 끊김</StatusBadge>
    </div>
  ),
};
