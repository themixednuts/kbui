import type { Preview } from "@storybook/sveltekit";

import "../src/app.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#f4efe6" },
        { name: "ink", value: "#181614" },
        { name: "surface", value: "#fbf7ee" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default preview;
