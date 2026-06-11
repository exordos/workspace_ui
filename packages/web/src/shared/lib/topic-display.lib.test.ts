import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import {
  isEmptyTopicName,
  resolveTopicDisplayInfo,
  topicMatchesDisplayQuery,
} from "./topic-display.lib";

describe("topic display helpers", () => {
  it("treats empty and legacy default-topic aliases as the system topic", () => {
    expect(isEmptyTopicName("   ")).toBe(true);
    expect(isEmptyTopicName("general chat")).toBe(true);
    expect(isEmptyTopicName("release")).toBe(false);
  });

  it("resolves the system topic to the localized general-chat label", () => {
    expect(resolveTopicDisplayInfo("   ")).toEqual({
      label: t("chat.generalChat"),
      normalized: "",
      isSystem: true,
    });
  });

  it("does not mark legacy alias or user-named general-chat topics as system styling", () => {
    expect(resolveTopicDisplayInfo("general chat")).toEqual({
      label: t("chat.generalChat"),
      normalized: "",
      isSystem: false,
    });
    expect(resolveTopicDisplayInfo(t("chat.generalChat"))).toEqual({
      label: t("chat.generalChat"),
      normalized: "",
      isSystem: false,
    });
  });

  it("matches the system topic by its localized display label in search", () => {
    expect(topicMatchesDisplayQuery("", t("chat.generalChat").toLowerCase())).toBe(true);
  });
});
