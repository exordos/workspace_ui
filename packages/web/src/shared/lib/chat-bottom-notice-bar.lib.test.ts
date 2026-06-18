import { describe, expect, it } from "vitest";
import { chatBottomNoticeBarClassName } from "./chat-bottom-notice-bar.lib";

describe("chatBottomNoticeBarClassName", () => {
  it("returns full rounded wrapper by default", () => {
    expect(chatBottomNoticeBarClassName({})).toContain("rounded-xl");
    expect(chatBottomNoticeBarClassName({})).toContain("border border-border-subtle");
    expect(chatBottomNoticeBarClassName({})).toContain("color-notice-base");
    expect(chatBottomNoticeBarClassName({})).toContain("gap-2");
  });

  it("supports wider gap for action bars", () => {
    expect(chatBottomNoticeBarClassName({ gap: "3" })).toContain("gap-3");
  });

  it("supports stacked rounding modes", () => {
    expect(chatBottomNoticeBarClassName({ round: "top", divided: true })).toContain("rounded-t-xl");
    expect(chatBottomNoticeBarClassName({ round: "top", divided: true })).toContain("border-t-0");
  });
});
