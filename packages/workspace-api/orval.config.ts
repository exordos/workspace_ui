import { defineConfig } from "orval";

export default defineConfig({
  workspace: {
    input: "./openapi/workspace.openapi.json",
    output: {
      mode: "single",
      target: "./src/generated/workspace-api.ts",
      client: "fetch",
      override: {
        mutator: {
          path: "./src/workspace-api-mutator.ts",
          name: "customInstance",
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
