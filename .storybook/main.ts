import type { StorybookConfig } from "@storybook/sveltekit";

const config: StorybookConfig = {
  framework: "@storybook/sveltekit",
  stories: ["../src/**/*.stories.@(ts|svelte)"],
  addons: ["@storybook/addon-svelte-csf", "@storybook/addon-docs"],
  typescript: {
    check: false,
  },
};

export default config;
