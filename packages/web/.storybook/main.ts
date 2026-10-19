import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import { docsContent } from "./docs-content";

const documentedProps = new Set(
  Object.values(docsContent).flatMap((content) => Object.keys(content.props ?? {})),
);

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  typescript: {
    // Resolve imported prop contracts from TypeScript source, including declared defaults.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      skipChildrenPropWithoutDoc: false,
      propFilter: (prop) =>
        !prop.parent?.fileName.includes("node_modules") || documentedProps.has(prop.name),
    },
  },
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
