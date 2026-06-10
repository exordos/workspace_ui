import { afterEach, describe, expect, it } from "vitest";
import { BRAND_ENV_DEFAULTS, applyBrandEnvDefaults } from "./brand-defaults.lib";

describe("brand-defaults.lib", () => {
  const touchedKeys: string[] = [];

  afterEach(() => {
    for (const key of touchedKeys) {
      delete process.env[key];
    }
    touchedKeys.length = 0;
  });

  it("defaults app name to Exordos Workspace", () => {
    expect(BRAND_ENV_DEFAULTS.VITE_BRAND_APP_NAME).toBe("Exordos Workspace");
  });

  it("applyBrandEnvDefaults fills missing keys without overwriting set values", () => {
    const env: Record<string, string> = { VITE_BRAND_APP_NAME: "Acme Chat" };
    applyBrandEnvDefaults(env);

    expect(env.VITE_BRAND_APP_NAME).toBe("Acme Chat");
    expect(env.VITE_BRAND_DESCRIPTION).toBe(BRAND_ENV_DEFAULTS.VITE_BRAND_DESCRIPTION);
    expect(process.env.VITE_BRAND_DESCRIPTION).toBe(BRAND_ENV_DEFAULTS.VITE_BRAND_DESCRIPTION);
    touchedKeys.push("VITE_BRAND_DESCRIPTION");
  });
});
