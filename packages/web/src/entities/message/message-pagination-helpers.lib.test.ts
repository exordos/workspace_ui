import { describe, expect, it } from "vitest";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";

describe("deriveFocusedPaginationFlags", () => {
  it("returns open older and closed newer when no focus id", () => {
    expect(deriveFocusedPaginationFlags([{ id: 1 }, { id: 2 }], null)).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("detects older and newer relative to focus", () => {
    expect(deriveFocusedPaginationFlags([{ id: 1 }, { id: 5 }, { id: 10 }], 5)).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: true,
    });
  });
});
