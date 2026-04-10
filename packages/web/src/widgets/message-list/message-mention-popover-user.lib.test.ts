import { describe, expect, it } from "vitest";
import { extractMentionNicknameFromEmail } from "./message-mention-popover-user.lib";

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
