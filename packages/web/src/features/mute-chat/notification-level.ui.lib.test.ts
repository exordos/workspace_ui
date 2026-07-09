import { describe, expect, it } from "vitest";
import {
  getTopicVisibilityLevelOptions,
  shouldShowTopicUnmuteOption,
} from "./notification-level.ui.lib";

describe("notification-level.ui.lib", () => {
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
