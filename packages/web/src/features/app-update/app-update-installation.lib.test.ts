import { describe, expect, it } from "vitest";
import { consumeInstalledAppUpdate, rememberPendingAppUpdate } from "./app-update-installation.lib";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("application update installation marker", () => {
  it("confirms the expected version once after restart", () => {
    const storage = createStorage();
    rememberPendingAppUpdate("v0.4.11", storage);

    expect(consumeInstalledAppUpdate("0.4.11", storage)).toBe("0.4.11");
    expect(consumeInstalledAppUpdate("0.4.11", storage)).toBeNull();
  });

  it("does not report success when the running version does not match", () => {
    const storage = createStorage();
    rememberPendingAppUpdate("0.4.11", storage);

    expect(consumeInstalledAppUpdate("0.4.10", storage)).toBeNull();
    expect(consumeInstalledAppUpdate("0.4.11", storage)).toBeNull();
  });

  it("ignores a missing target version", () => {
    const storage = createStorage();
    rememberPendingAppUpdate(undefined, storage);

    expect(consumeInstalledAppUpdate("0.4.11", storage)).toBeNull();
  });
});
