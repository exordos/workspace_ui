import { describe, expect, it } from "vitest";
import {
  getNextTopicVisibilityLevel,
  getTopicVisibilityLevelOption,
  getTopicVisibilityLevelOptions,
  shouldShowTopicUnmuteOption,
} from "./notification-level.ui.lib";

describe("notification-level.ui.lib", () => {
  describe("topic visibility options (Zulip order)", () => {
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

  describe("getNextTopicVisibilityLevel", () => {
    it("cycles inherit → unmuted → followed → muted in muted stream", () => {
      expect(getNextTopicVisibilityLevel("inherit", true, false)).toBe("unmuted");
      expect(getNextTopicVisibilityLevel("unmuted", true, false)).toBe("followed");
      expect(getNextTopicVisibilityLevel("followed", true, false)).toBe("muted");
      expect(getNextTopicVisibilityLevel("muted", true, false)).toBe("inherit");
    });

    it("cycles inherit → followed → muted in unmuted stream", () => {
      expect(getNextTopicVisibilityLevel("inherit", false, false)).toBe("followed");
      expect(getNextTopicVisibilityLevel("followed", false, false)).toBe("muted");
      expect(getNextTopicVisibilityLevel("muted", false, false)).toBe("inherit");
    });
  });

  describe("topic icons", () => {
    it("uses wifi-style follow icon for policy 3", () => {
      expect(getTopicVisibilityLevelOption("followed").icon).toBe("topic_follow");
    });

    it("uses inherit and unmute icons for policies 0 and 2", () => {
      expect(getTopicVisibilityLevelOption("inherit").icon).toBe("topic_inherit");
      expect(getTopicVisibilityLevelOption("unmuted").icon).toBe("topic_unmute");
    });
  });
});
