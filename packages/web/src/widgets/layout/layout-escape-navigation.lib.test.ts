import { describe, expect, it } from "vitest";
import {
  isMessengerChatPathname,
  isInboxMessengerPathname,
  isInteractiveElementFocused,
  resolveLayoutEscapeKeyDown,
} from "./layout-escape-navigation.lib";

describe("isMessengerChatPathname", () => {
  it("matches canonical Workspace stream, topic, and message routes", () => {
    expect(isMessengerChatPathname("/org/acme/project/project-uuid/stream/stream-uuid")).toBe(true);
    expect(
      isMessengerChatPathname("/org/acme/project/project-uuid/stream/stream-uuid/topic/topic-uuid"),
    ).toBe(true);
    expect(isMessengerChatPathname("/org/acme/project/project-uuid/message/message-uuid")).toBe(
      true,
    );
  });

  it("does not match legacy chat paths or inbox", () => {
    expect(isMessengerChatPathname("/stream/general")).toBe(false);
    expect(isMessengerChatPathname("/org/acme/dm/42")).toBe(false);
    expect(isMessengerChatPathname("/inbox")).toBe(false);
    expect(isMessengerChatPathname("/org/acme/inbox")).toBe(false);
  });
});

describe("resolveLayoutEscapeKeyDown", () => {
  const chatPathname = "/org/acme/project/project-uuid/stream/stream-uuid";

  const baseOptions = {
    key: "Escape",
    defaultPrevented: false,
    pathname: chatPathname,
    interactiveElementFocused: false,
    modalOpen: false,
  } as const;

  it("navigates to inbox from an open chat when no interactive element is focused", () => {
    expect(resolveLayoutEscapeKeyDown({ ...baseOptions })).toBe("navigate-inbox");
  });

  it("does nothing when an interactive element is focused", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        interactiveElementFocused: true,
      }),
    ).toBe("none");
  });

  it("does nothing when escape navigation is driven by focused interactive element detection", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        interactiveElementFocused: isInteractiveElementFocused(),
      }),
    ).toBe("none");

    input.remove();
  });

  it("does nothing when already on inbox", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        pathname: "/org/acme/inbox",
      }),
    ).toBe("none");
  });

  it("does nothing when a modal shortcut context is open", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        modalOpen: true,
      }),
    ).toBe("none");
  });

  it("does nothing for non-Escape keys", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        key: "Enter",
      }),
    ).toBe("none");
  });

  it("does nothing when defaultPrevented is true", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        ...baseOptions,
        defaultPrevented: true,
      }),
    ).toBe("none");
  });
});

describe("isInteractiveElementFocused", () => {
  it("returns true for input, textarea, select, and contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.append(editable);

    expect(isInteractiveElementFocused(input)).toBe(true);
    expect(isInteractiveElementFocused(textarea)).toBe(true);
    expect(isInteractiveElementFocused(select)).toBe(true);
    expect(isInteractiveElementFocused(editable)).toBe(true);

    editable.remove();
  });

  it("returns false for non-interactive elements", () => {
    expect(isInteractiveElementFocused(document.createElement("button"))).toBe(false);
    expect(isInteractiveElementFocused(null)).toBe(false);
  });
});

describe("isInboxMessengerPathname", () => {
  it("detects only the canonical Workspace inbox", () => {
    expect(isInboxMessengerPathname("/org/realm/project/project-uuid/inbox")).toBe(true);
    expect(isInboxMessengerPathname("/inbox")).toBe(false);
    expect(isInboxMessengerPathname("/org/realm/inbox")).toBe(false);
    expect(isInboxMessengerPathname("/stream/general")).toBe(false);
  });
});
