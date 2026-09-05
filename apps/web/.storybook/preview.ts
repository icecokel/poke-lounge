import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/globals.css";

if (typeof document !== "undefined") {
  document.documentElement.classList.add("dark");
}

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "Poke Lounge",
          [
            "Components",
            [
              "Pixel Button",
              "Pixel Panel",
              "Health Bar",
              "Pokemon Slot",
              "Message Box",
              "Status Badge",
              "Tournament Bracket",
            ],
            "Screens",
            ["*"],
            "Flows",
            ["*"],
          ],
          "UI",
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
