import { describe, expect, it } from "vitest";
import { countUnicodeCodePoints } from "./unicode-string.lib";

describe("countUnicodeCodePoints", () => {
  it("counts astral characters as one Unicode code point without changing BMP counts", () => {
    expect(countUnicodeCodePoints("a😀б")).toBe(3);
    expect(countUnicodeCodePoints("😀".repeat(20_001))).toBe(20_001);
  });
});
