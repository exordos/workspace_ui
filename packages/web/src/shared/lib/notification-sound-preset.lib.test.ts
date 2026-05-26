import { describe, expect, it } from "vitest";
import { resolveNotificationSoundPreset } from "./notification-sound-preset.lib";

describe("notification-sound-preset", () => {
  it("maps Zulip ding to default preset", () => {
    expect(resolveNotificationSoundPreset("ding", "glass")).toBe("default");
  });

  it("keeps local preset when already known", () => {
    expect(resolveNotificationSoundPreset("glass", "default")).toBe("glass");
  });

  it("falls back to local when server sound is unknown", () => {
    expect(resolveNotificationSoundPreset("unknown_sound", "pulse")).toBe("pulse");
  });
});
