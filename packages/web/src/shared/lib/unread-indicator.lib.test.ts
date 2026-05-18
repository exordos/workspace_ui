import { describe, expect, it } from "vitest";
import {
  getUnreadDotCenterTopRight,
  getUnreadDotRadiusPx,
  UNREAD_DOT_RADIUS_FRACTION,
} from "./unread-indicator.lib";

describe("unread-indicator.lib", () => {
  it("uses the same radius fraction as favicon-unread.svg", () => {
    expect(UNREAD_DOT_RADIUS_FRACTION).toBeCloseTo(80 / 680, 5);
    expect(getUnreadDotRadiusPx(32)).toBe(4);
    expect(getUnreadDotCenterTopRight(32)).toEqual({ x: 28, y: 4 });
  });
});
