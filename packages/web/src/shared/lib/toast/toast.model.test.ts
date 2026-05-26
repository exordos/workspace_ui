import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DEDUP_WINDOW_MS, TOAST_MAX_VISIBLE } from "~/shared/config/constants";
import { resetToastStateForTests, useToastStore } from "./toast.model";

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToastStateForTests();
  });

  afterEach(() => {
    resetToastStateForTests();
    vi.useRealTimers();
  });

  it("pushes toast entries", () => {
    const id = useToastStore.getState().push("Hello", "success");
    expect(id).toBeTruthy();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]?.message).toBe("Hello");
  });

  it("deduplicates identical messages within the dedup window", () => {
    const first = useToastStore.getState().push("Same", "error");
    const second = useToastStore.getState().push("Same", "error");
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("allows the same message after dedup window", () => {
    useToastStore.getState().push("Same", "error");
    vi.advanceTimersByTime(TOAST_DEDUP_WINDOW_MS + 1);
    useToastStore.getState().push("Same", "error");
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it("caps visible toasts at TOAST_MAX_VISIBLE", () => {
    for (let i = 0; i < TOAST_MAX_VISIBLE + 2; i += 1) {
      useToastStore.getState().push(`msg-${i}`, "info");
    }
    expect(useToastStore.getState().toasts).toHaveLength(TOAST_MAX_VISIBLE);
    expect(useToastStore.getState().toasts[0]?.message).toBe("msg-2");
  });

  it("auto-dismisses after variant timeout", () => {
    useToastStore.getState().push("Bye", "success");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("dismiss removes a toast by id", () => {
    const id = useToastStore.getState().push("Remove me", "error");
    expect(id).toBeTruthy();
    useToastStore.getState().dismiss(id!);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
