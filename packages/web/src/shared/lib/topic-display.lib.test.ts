import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import {
  isEmptyTopicName,
  resolveTopicDisplayInfo,
  topicMatchesDisplayQuery,
} from "./topic-display.lib";

describe("topic display helpers", () => {
  it("treats only empty normalized topic names as the system topic", () => {
    expect(isEmptyTopicName("   ")).toBe(true);
    expect(isEmptyTopicName("General Chat")).toBe(false);
  });

  it("resolves the system topic to the localized general-chat label", () => {
    expect(resolveTopicDisplayInfo("   ")).toEqual({
      label: t("chat.generalChat"),
      normalized: "",
      isSystem: true,
    });
  });

  it("matches the system topic by its localized display label in search", () => {
    expect(topicMatchesDisplayQuery("", t("chat.generalChat").toLowerCase())).toBe(true);
  });
});
