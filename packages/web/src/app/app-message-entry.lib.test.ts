import { describe, expect, it } from "vitest";
import {
  MESSAGE_APP_PREFERENCE_TTL,
  readMessageOpenPreference,
  writeMessageOpenPreference,
} from "./app-message-entry.lib";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("message entry preference", () => {
  it("defaults to browser and remembers only explicit choices for a fixed 30 days", () => {
    const data = storage();
    expect(readMessageOpenPreference(data, "org", 100)).toBe("browser");
    writeMessageOpenPreference(data, "org", "desktop", 100);
    const snapshot = [...data.values.values()];
    expect(readMessageOpenPreference(data, "org", 100 + MESSAGE_APP_PREFERENCE_TTL - 1)).toBe(
      "desktop",
    );
    expect([...data.values.values()]).toEqual(snapshot);
    expect(readMessageOpenPreference(data, "org", 100 + MESSAGE_APP_PREFERENCE_TTL)).toBe(
      "browser",
    );
    expect(readMessageOpenPreference(data, "another", 100)).toBe("browser");
    writeMessageOpenPreference(data, "org", "browser", 200);
    expect(readMessageOpenPreference(data, "org", 200)).toBe("browser");
  });
  it("uses the browser when storage is inaccessible or malformed", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readMessageOpenPreference(unavailable, "org")).toBe("browser");
    expect(() => writeMessageOpenPreference(unavailable, "org", "desktop")).not.toThrow();
    const data = storage();
    writeMessageOpenPreference(data, "org", "desktop", 100);
    const key = [...data.values.keys()][0]!;
    for (const raw of [
      "broken",
      "null",
      "{}",
      '{"version":2,"preference":"desktop","expiresAt":200}',
      '{"version":1,"preference":"desktop","expiresAt":1e100}',
    ]) {
      data.setItem(key, raw);
      expect(readMessageOpenPreference(data, "org", 100)).toBe("browser");
    }
  });
});
