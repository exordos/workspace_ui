import { describe, expect, it } from "vitest";
import { isNewlineCommand, isSendCommand } from "./message-composer-input-commands.lib";

function event(
  key: string,
  options?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
) {
  return {
    key,
    shiftKey: options?.shiftKey ?? false,
    metaKey: options?.metaKey ?? false,
    ctrlKey: options?.ctrlKey ?? false,
    altKey: options?.altKey ?? false,
  };
}

describe("message-composer-input-commands.lib", () => {
  it("treats Enter as send command in enter-sends mode", () => {
    expect(isSendCommand(event("Enter"), "enter-sends")).toBe(true);
    expect(isNewlineCommand(event("Enter"), "enter-sends")).toBe(false);
  });

  it("treats Shift+Enter as newline command in enter-sends mode", () => {
    expect(isSendCommand(event("Enter", { shiftKey: true }), "enter-sends")).toBe(false);
    expect(isNewlineCommand(event("Enter", { shiftKey: true }), "enter-sends")).toBe(true);
  });

  it("treats Mod+Enter as send command in mod-enter-sends mode", () => {
    expect(isSendCommand(event("Enter", { metaKey: true }), "mod-enter-sends")).toBe(true);
    expect(isSendCommand(event("Enter", { ctrlKey: true }), "mod-enter-sends")).toBe(true);
  });

  it("treats Enter as newline command in mod-enter-sends mode", () => {
    expect(isSendCommand(event("Enter"), "mod-enter-sends")).toBe(false);
    expect(isNewlineCommand(event("Enter"), "mod-enter-sends")).toBe(true);
  });
});
