import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLayoutResetRightDrawerOnOwnerChange } from "./layout-reset-right-drawer-on-owner-change.hook";

describe("useLayoutResetRightDrawerOnOwnerChange", () => {
  it("does not close the drawer on initial render", () => {
    const closeRightDrawer = vi.fn();

    renderHook(
      ({ currentOwnerKey }) =>
        useLayoutResetRightDrawerOnOwnerChange({
          currentOwnerKey,
          closeRightDrawer,
        }),
      {
        initialProps: { currentOwnerKey: "org-a" },
      },
    );

    expect(closeRightDrawer).not.toHaveBeenCalled();
  });

  it("closes the drawer when the active owner changes", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentOwnerKey }) =>
        useLayoutResetRightDrawerOnOwnerChange({
          currentOwnerKey,
          closeRightDrawer,
        }),
      {
        initialProps: { currentOwnerKey: "org-a" },
      },
    );

    rerender({ currentOwnerKey: "org-b" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });

  it("does not close the drawer again when the owner key stays the same", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentOwnerKey }) =>
        useLayoutResetRightDrawerOnOwnerChange({
          currentOwnerKey,
          closeRightDrawer,
        }),
      {
        initialProps: { currentOwnerKey: "org-a" },
      },
    );

    rerender({ currentOwnerKey: "org-b" });
    rerender({ currentOwnerKey: "org-b" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });

  it("closes the drawer when the owner key changes after an initial null render", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentOwnerKey }) =>
        useLayoutResetRightDrawerOnOwnerChange({
          currentOwnerKey,
          closeRightDrawer,
        }),
      {
        initialProps: { currentOwnerKey: null as string | null },
      },
    );

    rerender({ currentOwnerKey: "org-a" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });
});
