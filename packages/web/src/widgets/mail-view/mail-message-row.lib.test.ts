import { describe, expect, it } from "vitest";
import { resolveMailMessageRowClasses } from "./mail-message-row.lib";

describe("resolveMailMessageRowClasses", () => {
  it("uses selection chrome for active row", () => {
    expect(resolveMailMessageRowClasses({ active: true, unread: true, flagged: true })).toEqual({
      row: "border-l-accent bg-card-bg-active",
      showUnreadDot: false,
    });
  });

  it("uses warm tint for flagged row", () => {
    expect(resolveMailMessageRowClasses({ active: false, unread: false, flagged: true })).toEqual({
      row: "border-l-transparent bg-accent-soft/20",
      showUnreadDot: false,
    });
  });

  it("shows unread dot for unread row without flag", () => {
    expect(resolveMailMessageRowClasses({ active: false, unread: true, flagged: false })).toEqual({
      row: "border-l-transparent",
      showUnreadDot: true,
    });
  });

  it("combines flagged tint with unread dot", () => {
    expect(resolveMailMessageRowClasses({ active: false, unread: true, flagged: true })).toEqual({
      row: "border-l-transparent bg-accent-soft/20",
      showUnreadDot: true,
    });
  });

  it("uses neutral chrome for read row", () => {
    expect(resolveMailMessageRowClasses({ active: false, unread: false, flagged: false })).toEqual({
      row: "border-l-transparent",
      showUnreadDot: false,
    });
  });
});
