import { defineConfig } from "orval";

export default defineConfig({
  mail: {
    input: "./openapi/mail-proxy.openapi.json",
    output: {
      mode: "single",
      target: "./src/generated/mail-api.ts",
      client: "fetch",
      override: {
        mutator: {
          path: "./src/mail-api-mutator.ts",
          name: "customInstance",
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
