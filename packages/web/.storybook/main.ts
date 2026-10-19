import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        // Keep application proxies, PWA registration and deployment settings out of the UI catalog.
        viteConfigPath: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
      },
    },
  },
  core: { disableTelemetry: true },
};

export default config;
