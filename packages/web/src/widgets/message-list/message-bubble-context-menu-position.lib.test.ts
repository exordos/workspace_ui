import { describe, expect, it } from "vitest";
import {
  computeMessageContextMenuPosition,
  MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX,
  MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
} from "./message-bubble-context-menu-position.lib";

describe("computeMessageContextMenuPosition", () => {
  const bounds = {
    left: 100,
    top: 100,
    right: 900,
    bottom: 700,
  };

  it("places the menu near cursor in the center with right-side preference", () => {
    const result = computeMessageContextMenuPosition({
      clientX: 400,
      clientY: 300,
      bounds,
      menuWidth: MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
      menuHeight: MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX,
    });

    expect(result.side).toBe("right");
    expect(result.menuLeft).toBe(406);
    expect(result.menuTop).toBe(300);
  });

  it("switches to left side when there is not enough horizontal space on the right", () => {
    const result = computeMessageContextMenuPosition({
      clientX: 860,
      clientY: 320,
      bounds,
      menuWidth: MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
      menuHeight: MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX,
    });

    expect(result.side).toBe("left");
    expect(result.menuLeft).toBe(654);
    expect(result.menuTop).toBe(320);
  });

  it("clamps menu position to bounds when clicked near top-left corner", () => {
    const result = computeMessageContextMenuPosition({
      clientX: 102,
      clientY: 104,
      bounds,
      menuWidth: MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
      menuHeight: MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX,
    });

    expect(result.menuLeft).toBe(108);
    expect(result.menuTop).toBe(108);
  });

  it("clamps vertical position when clicked near the bottom edge", () => {
    const result = computeMessageContextMenuPosition({
      clientX: 450,
      clientY: 690,
      bounds,
      menuWidth: MESSAGE_CONTEXT_MENU_EST_WIDTH_PX,
      menuHeight: MESSAGE_CONTEXT_MENU_EST_HEIGHT_PX,
    });

    expect(result.menuTop).toBe(372);
  });
});
