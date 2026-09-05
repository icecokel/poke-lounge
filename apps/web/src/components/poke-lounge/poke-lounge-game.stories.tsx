import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../messages/ko-KR.json";
import { GameProvider } from "@/contexts/game-context";
import { PokeLoungeGame } from "./poke-lounge-game";

const meta = {
  title: "Poke Lounge/Flows/Full Game",
  beforeEach() {
    const fetch = globalThis.fetch;
    globalThis.fetch = (input, init) =>
      String(input).endsWith("/api/local-test-mode")
        ? Promise.resolve(Response.json({ available: false, active: false }))
        : String(input).endsWith("/api/local-test-mode/session")
          ? Promise.resolve(Response.json(null))
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
        <NextIntlClientProvider locale="ko-KR" messages={messages}>
          <GameProvider>
            <Story />
          </GameProvider>
        </NextIntlClientProvider>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <PokeLoungeGame />,
};
