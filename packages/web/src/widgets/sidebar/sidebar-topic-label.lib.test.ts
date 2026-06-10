import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { resolveSidebarTopicLabel } from "./sidebar-topic-label.lib";

describe("resolveSidebarTopicLabel", () => {
  it("returns topic name when it is not empty", () => {
    expect(resolveSidebarTopicLabel("incident")).toBe("incident");
  });

  it("returns localized fallback for empty topic", () => {
    expect(resolveSidebarTopicLabel("   ")).toBe(t("channel.emptyTopic"));
  });
});
