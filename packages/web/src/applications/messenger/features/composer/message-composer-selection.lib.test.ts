import { afterEach, describe, expect, it, vi } from "vitest";
import { mutateSelection } from "./message-composer-selection.lib";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mutateSelection", () => {
  it("preserves textarea scroll while restoring focus and selection", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const textarea = document.createElement("textarea");
    textarea.value = "alpha";
    textarea.setSelectionRange(0, textarea.value.length);
    textarea.scrollTop = 72;
    const focus = vi.spyOn(textarea, "focus");
    const onValueChange = vi.fn((nextValue: string) => {
      textarea.value = nextValue;
      // Simulate the browser clamping scroll while autosize temporarily expands the textarea.
      textarea.scrollTop = 0;
    });

    mutateSelection({ current: textarea }, onValueChange, (selected) => ({
      text: `**${selected}**`,
      selectionStartOffset: selected.length + 4,
      selectionEndOffset: selected.length + 4,
    }));

    expect(onValueChange).toHaveBeenCalledWith("**alpha**");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(textarea.selectionStart).toBe(9);
    expect(textarea.selectionEnd).toBe(9);
    expect(textarea.scrollTop).toBe(72);
  });
});
