import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../messages/ko-KR.json";
import { GameProvider } from "@/contexts/game-context";
import { PokeLoungeGame } from "./poke-lounge-game";

const meta = {
  title: "Poke Lounge/Full Game",
  tags: ["autodocs"],
  beforeEach() {
    const fetch = globalThis.fetch;
    globalThis.fetch = (input, init) =>
      String(input).endsWith("/api/local-test-mode")
        ? Promise.resolve(Response.json({ available: false, active: false }))
        : fetch(input, init);
    return () => {
      globalThis.fetch = fetch;
    };
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/ko-KR/game/poke-lounge" },
    },
  },
  decorators: [
    function callback(Story) {
      return (
        <SessionProvider session={null}>
          <NextIntlClientProvider locale="ko-KR" messages={messages}>
            <GameProvider>
              <Story />
            </GameProvider>
          </NextIntlClientProvider>
        </SessionProvider>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <PokeLoungeGame />,
};
