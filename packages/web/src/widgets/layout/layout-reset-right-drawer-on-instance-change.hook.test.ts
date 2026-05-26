import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLayoutResetRightDrawerOnInstanceChange } from "./layout-reset-right-drawer-on-instance-change.hook";

describe("useLayoutResetRightDrawerOnInstanceChange", () => {
  it("does not close the drawer on initial render", () => {
    const closeRightDrawer = vi.fn();

    renderHook(
      ({ currentInstanceId }) =>
        useLayoutResetRightDrawerOnInstanceChange({
          currentInstanceId,
          closeRightDrawer,
        }),
      {
        initialProps: { currentInstanceId: "org-a" },
      },
    );

    expect(closeRightDrawer).not.toHaveBeenCalled();
  });

  it("closes the drawer when the active organization changes", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentInstanceId }) =>
        useLayoutResetRightDrawerOnInstanceChange({
          currentInstanceId,
          closeRightDrawer,
        }),
      {
        initialProps: { currentInstanceId: "org-a" },
      },
    );

    rerender({ currentInstanceId: "org-b" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });

  it("does not close the drawer again when the organization id stays the same", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentInstanceId }) =>
        useLayoutResetRightDrawerOnInstanceChange({
          currentInstanceId,
          closeRightDrawer,
        }),
      {
        initialProps: { currentInstanceId: "org-a" },
      },
    );

    rerender({ currentInstanceId: "org-b" });
    rerender({ currentInstanceId: "org-b" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });

  it("closes the drawer when the instance id changes after an initial null render", () => {
    const closeRightDrawer = vi.fn();

    const { rerender } = renderHook(
      ({ currentInstanceId }) =>
        useLayoutResetRightDrawerOnInstanceChange({
          currentInstanceId,
          closeRightDrawer,
        }),
      {
        initialProps: { currentInstanceId: null as string | null },
      },
    );

    rerender({ currentInstanceId: "org-a" });

    expect(closeRightDrawer).toHaveBeenCalledTimes(1);
  });
});
