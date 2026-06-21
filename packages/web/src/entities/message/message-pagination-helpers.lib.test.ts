import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";

describe("deriveFocusedPaginationFlags", () => {
  it("returns open older and closed newer when no focus id", () => {
    expect(
      deriveFocusedPaginationFlags([{ id: testMessageId(1) }, { id: testMessageId(2) }], null),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: false,
    });
  });

  it("detects older and newer relative to focus", () => {
    expect(
      deriveFocusedPaginationFlags(
        [{ id: testMessageId(1) }, { id: testMessageId(5) }, { id: testMessageId(10) }],
        testMessageId(5),
      ),
    ).toEqual({
      hasOlderMessages: true,
      hasNewerMessages: true,
    });
  });
});
