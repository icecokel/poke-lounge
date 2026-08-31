import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/globals.css";

if (typeof document !== "undefined") {
  document.documentElement.classList.add("dark");
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
