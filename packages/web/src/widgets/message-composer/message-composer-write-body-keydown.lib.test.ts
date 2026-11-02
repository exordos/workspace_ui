import { describe, expect, it, vi } from "vitest";
import { handleComposerWriteBodyKeyDown } from "./message-composer-write-body-keydown.lib";
import type { KeyboardEvent, RefObject } from "react";

function createKeyEvent(
  key: string,
  init: Partial<KeyboardEvent> = {},
): KeyboardEvent<HTMLTextAreaElement> {
  return {
    key,
    nativeEvent: new globalThis.KeyboardEvent("keydown", { key }),
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...init,
  } as KeyboardEvent<HTMLTextAreaElement>;
}

function baseOptions(
  overrides: Partial<Parameters<typeof handleComposerWriteBodyKeyDown>[0]> = {},
) {
  return {
    event: createKeyEvent("Enter"),
    value: "hello",
    showMentions: false,
    mentionSuggestions: [],
    activeMentionIndex: 0,
    sendNewlineMode: "enter-sends" as const,
    isEditing: false,
    textareaRef: { current: null } as RefObject<HTMLTextAreaElement | null>,
    onActiveMentionIndexChange: vi.fn(),
    onMentionSelect: vi.fn(),
    onHideMentionDropdown: vi.fn(),
    onValueChange: vi.fn(),
    onDetectMention: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
}

describe("handleComposerWriteBodyKeyDown", () => {
  it("sends on Enter when global shortcuts are disabled", () => {
    const onSend = vi.fn();
    const event = createKeyEvent("Enter");
    handleComposerWriteBodyKeyDown(baseOptions({ event, onSend }));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSend).toHaveBeenCalled();
  });

  it("cancels edit on Escape when global shortcuts are disabled", () => {
    const onCancelEdit = vi.fn();
    const event = createKeyEvent("Escape");
    handleComposerWriteBodyKeyDown(baseOptions({ event, isEditing: true, onCancelEdit }));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it("leaves composition and already handled events untouched", () => {
    for (const init of [
      { nativeEvent: new globalThis.KeyboardEvent("keydown", { isComposing: true }) },
      { defaultPrevented: true },
    ]) {
      const options = baseOptions({ event: createKeyEvent("Enter", init) });
      handleComposerWriteBodyKeyDown(options);
      expect(options.onSend).not.toHaveBeenCalled();
      expect(options.event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it("does not send repeatedly when Enter is held", () => {
    const options = baseOptions({ event: createKeyEvent("Enter", { repeat: true }) });
    handleComposerWriteBodyKeyDown(options);
    expect(options.onSend).not.toHaveBeenCalled();
    expect(options.event.preventDefault).toHaveBeenCalled();
  });

  it("blurs composer on Escape when not editing", () => {
    const textarea = document.createElement("textarea");
    const blur = vi.spyOn(textarea, "blur");
    const event = createKeyEvent("Escape");

    handleComposerWriteBodyKeyDown(
      baseOptions({
        event,
        textareaRef: { current: textarea },
      }),
    );

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(blur).toHaveBeenCalled();
  });
});
