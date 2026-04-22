import { describe, expect, it } from "vitest";
import {
  extractMentionNicknameFromEmail,
  resolveMentionDisplayForPopover,
} from "./message-mention-popover-user.lib";

describe("extractMentionNicknameFromEmail", () => {
  it("returns local part before @", () => {
    expect(extractMentionNicknameFromEmail("alice@example.com")).toBe("alice");
  });

  it("returns full string when no @", () => {
    expect(extractMentionNicknameFromEmail("delivery-status")).toBe("delivery-status");
  });

  it("returns undefined for empty", () => {
    expect(extractMentionNicknameFromEmail("")).toBeUndefined();
    expect(extractMentionNicknameFromEmail("   ")).toBeUndefined();
    expect(extractMentionNicknameFromEmail(undefined)).toBeUndefined();
  });
});

describe("resolveMentionDisplayForPopover", () => {
  it("prefers email local part with @ prefix", () => {
    expect(resolveMentionDisplayForPopover("alice@example.com", "@ignored")).toBe("@alice");
  });

  it("uses fallback when email yields no nick", () => {
    expect(resolveMentionDisplayForPopover(undefined, "Bob")).toBe("@Bob");
    expect(resolveMentionDisplayForPopover("", "  @carol  ")).toBe("@carol");
    expect(resolveMentionDisplayForPopover(undefined, "@Bob")).toBe("@Bob");
  });

  it("returns undefined when fallback is empty", () => {
    expect(resolveMentionDisplayForPopover(undefined, "")).toBeUndefined();
    expect(resolveMentionDisplayForPopover(undefined, "   ")).toBeUndefined();
  });
});
