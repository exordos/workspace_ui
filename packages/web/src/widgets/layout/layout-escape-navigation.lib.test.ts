import { describe, expect, it } from "vitest";
import {
  isInboxMessengerPathname,
  resolveLayoutEscapeKeyDown,
} from "./layout-escape-navigation.lib";
import { isMessengerChatPathname } from "./layout-sync-chat-context.lib";

describe("isMessengerChatPathname", () => {
  it("matches stream and DM routes", () => {
    expect(isMessengerChatPathname("/stream/general")).toBe(true);
    expect(isMessengerChatPathname("/org/acme/dm/42")).toBe(true);
  });

  it("does not match inbox", () => {
    expect(isMessengerChatPathname("/inbox")).toBe(false);
    expect(isMessengerChatPathname("/org/acme/inbox")).toBe(false);
  });
});

describe("resolveLayoutEscapeKeyDown", () => {
  it("navigates to inbox from an open chat when composer is not focused", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        key: "Escape",
        defaultPrevented: false,
        pathname: "/org/acme/stream/general",
        composerFocused: false,
        modalOpen: false,
      }),
    ).toBe("navigate-inbox");
  });

  it("does nothing when composer textarea is focused", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        key: "Escape",
        defaultPrevented: false,
        pathname: "/stream/general",
        composerFocused: true,
        modalOpen: false,
      }),
    ).toBe("none");
  });

  it("does nothing when already on inbox", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        key: "Escape",
        defaultPrevented: false,
        pathname: "/org/acme/inbox",
        composerFocused: false,
        modalOpen: false,
      }),
    ).toBe("none");
  });

  it("does nothing when a modal shortcut context is open", () => {
    expect(
      resolveLayoutEscapeKeyDown({
        key: "Escape",
        defaultPrevented: true,
        pathname: "/stream/general",
        composerFocused: false,
        modalOpen: true,
      }),
    ).toBe("none");
  });
});

describe("isInboxMessengerPathname", () => {
  it("detects inbox with and without org prefix", () => {
    expect(isInboxMessengerPathname("/inbox")).toBe(true);
    expect(isInboxMessengerPathname("/org/realm/inbox")).toBe(true);
    expect(isInboxMessengerPathname("/stream/general")).toBe(false);
  });
});
