import { describe, expect, it } from "vitest";
import {
  hasConsecutiveIntegerGap,
  isStrictlyIncreasingUniqueIds,
} from "~/shared/lib/message-cache-policy.lib";

describe("message-cache-policy.lib", () => {
  it("isStrictlyIncreasingUniqueIds returns false on duplicate or decrease", () => {
    expect(isStrictlyIncreasingUniqueIds([1, 2, 3])).toBe(true);
    expect(isStrictlyIncreasingUniqueIds([1, 1])).toBe(false);
    expect(isStrictlyIncreasingUniqueIds([3, 2])).toBe(false);
  });

  it("hasConsecutiveIntegerGap detects missing step", () => {
    expect(hasConsecutiveIntegerGap([1, 2, 3])).toBe(false);
    expect(hasConsecutiveIntegerGap([1, 3])).toBe(true);
  });
});
