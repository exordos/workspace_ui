import { describe, expect, it } from "vitest";
import { DESKTOP_MIN_VIEWPORT_WIDTH_PX } from "~/shared/config/constants";
import { DESKTOP_MIN_VIEWPORT_STYLE } from "./layout-desktop-viewport.lib";

describe("layout-desktop-viewport", () => {
  it("defines desktop minimum viewport width as 1200px", () => {
    expect(DESKTOP_MIN_VIEWPORT_WIDTH_PX).toBe(1200);
    expect(DESKTOP_MIN_VIEWPORT_STYLE).toEqual({ minWidth: "1200px" });
  });
});
