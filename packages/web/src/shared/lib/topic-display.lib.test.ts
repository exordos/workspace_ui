import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import {
  isEmptyTopicName,
  resolveTopicDisplayInfo,
  topicMatchesDisplayQuery,
} from "./topic-display.lib";

describe("topic display helpers", () => {
  it("treats only empty subjects as the system topic", () => {
    expect(isEmptyTopicName("   ")).toBe(true);
    expect(isEmptyTopicName("general chat")).toBe(false);
    expect(isEmptyTopicName("release")).toBe(false);
  });

  it("resolves the system topic to the localized general-chat label", () => {
    expect(resolveTopicDisplayInfo("   ")).toEqual({
      label: t("chat.generalChat"),
      normalized: "",
      isSystem: true,
    });
  });

  it("preserves server-provided general-chat topic names", () => {
    expect(resolveTopicDisplayInfo("general chat")).toEqual({
      label: "general chat",
      normalized: "general chat",
      isSystem: false,
    });
    expect(resolveTopicDisplayInfo(t("chat.generalChat"))).toEqual({
      label: t("chat.generalChat"),
      normalized: t("chat.generalChat"),
      isSystem: false,
    });
  });

  it("matches the system topic by its localized display label in search", () => {
    expect(topicMatchesDisplayQuery("", t("chat.generalChat").toLowerCase())).toBe(true);
  });
});
