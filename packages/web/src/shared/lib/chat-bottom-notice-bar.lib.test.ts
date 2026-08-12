import { describe, expect, it } from "vitest";
import {
  CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE,
  CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME,
  CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME,
  chatBottomNoticeActionButtonClassName,
  chatBottomNoticeActionClassName,
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "./chat-bottom-notice-bar.lib";

describe("chatBottomNoticeBarClassName", () => {
  it("returns full rounded wrapper by default", () => {
    expect(chatBottomNoticeBarClassName({})).toContain("rounded-xl");
    expect(chatBottomNoticeBarClassName({})).toContain("border border-border-subtle");
    expect(chatBottomNoticeBarClassName({})).toContain("bg-composer-outer");
    expect(chatBottomNoticeBarClassName({})).not.toContain("color-notice-base");
    expect(chatBottomNoticeBarClassName({})).toContain("gap-2");
    expect(chatBottomNoticeBarClassName({})).toContain("py-1.5");
    expect(chatBottomNoticeBarClassName({})).not.toContain("py-2.5");
  });

  it("supports wider gap for action bars", () => {
    expect(chatBottomNoticeBarClassName({ gap: "3" })).toContain("gap-3");
  });

  it("supports shell-only chrome without content padding", () => {
    const className = chatBottomNoticeBarClassName({ shellOnly: true });
    expect(className).toContain("bg-composer-outer");
    expect(className).toContain("overflow-hidden");
    expect(className).not.toContain("px-4");
    expect(className).not.toContain("px-5");
    expect(className).not.toContain("px-2");
    expect(className).not.toContain("py-1.5");
    expect(className).not.toContain("py-2.5");
    expect(className).not.toContain("gap-2");
  });

  it("keeps reply chrome and preface strip on the solid composer surface", () => {
    expect(CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME).toContain("bg-composer-outer");
    expect(CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME).not.toContain("border-b");
    expect(CHAT_BOTTOM_NOTICE_REPLY_CHROME_CLASS_NAME).not.toContain("bg-bg/50");
    expect(CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME).toContain("bg-composer-outer");
    expect(CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME).toContain("px-2");
    expect(CHAT_BOTTOM_NOTICE_PREFACE_STRIP_CLASS_NAME).not.toContain("bg-bg/50");
  });

  it("supports taller inline alerts without conflicting padding classes", () => {
    const className = chatBottomNoticeBarClassName({ paddingY: "alert" });
    expect(className).toContain("py-2.5");
    expect(className).not.toContain("py-1.5");
  });

  it("supports a wide horizontal inset without conflicting padding classes", () => {
    const className = chatBottomNoticeBarClassName({ paddingX: "wide" });
    expect(className).toContain("px-6");
    expect(className).not.toContain("px-2");
  });

  it("keeps only the outside corners when joined to adjacent surfaces", () => {
    expect(chatBottomNoticeBarClassName({ joinedBelow: true })).toContain("rounded-t-xl");
    expect(chatBottomNoticeBarClassName({ joinedAbove: true })).toContain("rounded-b-xl");

    const middleClassName = chatBottomNoticeBarClassName({
      joinedAbove: true,
      joinedBelow: true,
    });
    expect(middleClassName).toContain("rounded-none");
    expect(middleClassName).toContain("border-b");
    expect(middleClassName).not.toContain("border border-border-subtle");
  });

  it("keeps severity color out of the shared surface", () => {
    expect(chatBottomNoticeMarkerClassName("danger")).toBe("bg-danger");
    expect(chatBottomNoticeActionClassName("danger")).toContain("text-danger");
    expect(chatBottomNoticeMarkerClassName("warning")).toBe("bg-indicator-yellow");
    expect(chatBottomNoticeMarkerClassName("info")).toBe("bg-accent");
    expect(chatBottomNoticeMarkerClassName("neutral")).toBe("bg-text-muted");
  });

  it("builds shared action button chrome with optional transparent cancel style", () => {
    expect(CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE).toContain("rounded-lg");
    expect(CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE).toContain("px-3");
    expect(CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE).toContain("py-1.5");

    const danger = chatBottomNoticeActionButtonClassName("danger");
    expect(danger).toContain(CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE);
    expect(danger).toContain("text-danger");
    expect(danger).not.toContain("bg-transparent");

    const cancel = chatBottomNoticeActionButtonClassName("neutral", { transparent: true });
    expect(cancel).toContain(CHAT_BOTTOM_NOTICE_ACTION_BUTTON_BASE);
    expect(cancel).toContain("bg-transparent");
    expect(cancel).toContain("border-border-subtle");
  });
});
