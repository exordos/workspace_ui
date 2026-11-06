import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLayoutWindowBranding } from "./layout-window-branding.hook";

describe("useLayoutWindowBranding", () => {
  it.each([
    [1001, "1k+"],
    [2002, "2k+"],
  ])("formats unread total %i and clears the prefix when read", (count, label) => {
    const { rerender } = renderHook(
      ({ unreadCount }) =>
        useLayoutWindowBranding({ unreadCount, activeChatWindowTitle: "General" }),
      { initialProps: { unreadCount: count } },
    );

    expect(document.title.startsWith(`(${label}) General - `)).toBe(true);
    rerender({ unreadCount: 0 });
    expect(document.title).toMatch(/^General - /);
  });
});
