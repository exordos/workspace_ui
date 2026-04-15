import { describe, expect, it } from "vitest";
import { APP_SHELL_MIN_WIDTH_PX, DESKTOP_MIN_VIEWPORT_WIDTH_PX } from "~/shared/config/constants";
import * as LayoutViewport from "./layout-desktop-viewport.lib";

describe("layout-desktop-viewport", () => {
  it("re-exports constants aligned with Tailwind narrow-page and app-shell-min", () => {
    expect(LayoutViewport.DESKTOP_MIN_VIEWPORT_WIDTH_PX).toBe(DESKTOP_MIN_VIEWPORT_WIDTH_PX);
    expect(LayoutViewport.DESKTOP_MIN_VIEWPORT_WIDTH_PX).toBe(1200);
    expect(LayoutViewport.APP_SHELL_MIN_WIDTH_PX).toBe(APP_SHELL_MIN_WIDTH_PX);
    expect(APP_SHELL_MIN_WIDTH_PX).toBe(360);
  });
});
