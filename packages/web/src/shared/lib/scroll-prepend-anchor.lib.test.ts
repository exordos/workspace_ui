import { describe, expect, it } from "vitest";
import { computeScrollTopAfterPrepend } from "./scroll-prepend-anchor.lib";

describe("computeScrollTopAfterPrepend", () => {
  it("preserves visible anchor after prepending older messages", () => {
    expect(
      computeScrollTopAfterPrepend(
        {
          scrollTop: 18,
          scrollHeight: 700,
        },
        910,
      ),
    ).toBe(228);
  });

  it("clamps to zero when next height is unexpectedly smaller", () => {
    expect(
      computeScrollTopAfterPrepend(
        {
          scrollTop: 20,
          scrollHeight: 700,
        },
        650,
      ),
    ).toBe(0);
  });
});
