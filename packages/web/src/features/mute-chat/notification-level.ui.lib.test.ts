import { describe, expect, it } from "vitest";
import {
  getNotificationLevelSwitchSizeStyles,
  getStreamNotificationLevelOption,
  getTopicVisibilityLevelOption,
  getTopicVisibilityLevelOptions,
  shouldShowTopicUnmuteOption,
} from "./notification-level.ui.lib";

describe("notification-level.ui.lib", () => {
  it("maps notification levels to their existing icons", () => {
    expect(getStreamNotificationLevelOption("muted").icon).toBe("bell_off");
    expect(getStreamNotificationLevelOption("subscribed").icon).toBe("bell");
    expect(getTopicVisibilityLevelOption("muted").icon).toBe("topic_mute");
    expect(getTopicVisibilityLevelOption("unmuted").icon).toBe("at");
    expect(getTopicVisibilityLevelOption("followed").icon).toBe("topic_follow");
  });

  describe("switch size styles", () => {
    it("exposes universal sm/md/lg densities without outer border", () => {
      const sm = getNotificationLevelSwitchSizeStyles("sm");
      const md = getNotificationLevelSwitchSizeStyles("md");
      const lg = getNotificationLevelSwitchSizeStyles("lg");

      expect(sm.iconSize).toBe(14);
      expect(sm.containerClass).toContain("p-0.5");
      expect(sm.containerClass).not.toContain("border");

      expect(md.iconSize).toBe(18);
      expect(md.containerClass).toContain("p-1");
      expect(md.containerClass).not.toContain("border");

      expect(lg.iconSize).toBe(28);
      expect(lg.containerClass).toContain("gap-2");
      expect(lg.containerClass).toContain("p-1");
      expect(lg.containerClass).not.toContain("border");
      expect(lg.segmentButtonClass).toContain("h-9");
      expect(lg.segmentButtonClass).not.toContain("py-");
    });

    it("defaults to md when size is omitted", () => {
      expect(getNotificationLevelSwitchSizeStyles()).toEqual(
        getNotificationLevelSwitchSizeStyles("md"),
      );
    });
  });

  describe("topic visibility options", () => {
    it("shows 3 segments when stream is not muted and topic is inherit", () => {
      const options = getTopicVisibilityLevelOptions(false, false);
      expect(options.map((o) => o.level)).toEqual(["muted", "inherit", "followed"]);
    });

    it("shows 4 segments when stream is muted", () => {
      const options = getTopicVisibilityLevelOptions(true, false);
      expect(options.map((o) => o.level)).toEqual(["muted", "inherit", "unmuted", "followed"]);
    });

    it("shows unmute segment when topic is explicitly unmuted in unmuted stream", () => {
      expect(shouldShowTopicUnmuteOption(false, true)).toBe(true);
      const options = getTopicVisibilityLevelOptions(false, true);
      expect(options.map((o) => o.level)).toContain("unmuted");
    });
  });
});
