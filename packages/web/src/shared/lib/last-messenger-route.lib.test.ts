import { afterEach, describe, expect, it } from "vitest";
import {
  clearLastMessengerRoutes,
  extractPersistableMessengerChatPath,
  loadLastMessengerRoute,
  resolveMessengerNavigationPath,
  saveLastMessengerRoute,
  TRAY_MESSENGER_OPEN_ROUTE,
} from "./last-messenger-route.lib";

describe("last-messenger-route", () => {
  afterEach(() => {
    clearLastMessengerRoutes();
  });

  it("extracts persistable stream and dm paths without org prefix", () => {
    expect(extractPersistableMessengerChatPath("/org/acme/stream/5-engineering/topic/bugs")).toBe(
      "/stream/5-engineering/topic/bugs",
    );
    expect(extractPersistableMessengerChatPath("/org/acme/dm/12-34")).toBe("/dm/12-34");
  });

  it("ignores non-chat messenger sections", () => {
    expect(extractPersistableMessengerChatPath("/org/acme/calendar")).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/inbox")).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/activity/starred")).toBeNull();
  });

  it("does not persist transient permalink redirects", () => {
    expect(extractPersistableMessengerChatPath("/org/acme/message/12345")).toBeNull();
    expect(extractPersistableMessengerChatPath("/message/12345")).toBeNull();
  });

  it("persists and restores last route per instance", () => {
    saveLastMessengerRoute("inst-a", "/stream/10-marketing");
    saveLastMessengerRoute("inst-b", "/dm/42");

    expect(loadLastMessengerRoute("inst-a")).toBe("/stream/10-marketing");
    expect(loadLastMessengerRoute("inst-b")).toBe("/dm/42");
    expect(resolveMessengerNavigationPath("inst-a", "general")).toBe("/stream/10-marketing");
  });

  it("falls back to default stream when nothing saved", () => {
    expect(resolveMessengerNavigationPath("missing", "engineering")).toBe("/stream/engineering");
    expect(resolveMessengerNavigationPath(null, "general")).toBe("/stream/general");
  });

  it("exposes tray open sentinel route", () => {
    expect(TRAY_MESSENGER_OPEN_ROUTE).toBe("/open/messenger");
  });

  it("ignores non-persistable paths on save", () => {
    saveLastMessengerRoute("inst-a", "/calendar");
    saveLastMessengerRoute("inst-a", "/inbox");
    expect(loadLastMessengerRoute("inst-a")).toBeNull();
  });

  it("recovers from corrupted localStorage payload", () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("workspace-last-messenger-route", "{not-json");
    }
    expect(loadLastMessengerRoute("inst-a")).toBeNull();
    saveLastMessengerRoute("inst-a", "/stream/1-general");
    expect(loadLastMessengerRoute("inst-a")).toBe("/stream/1-general");
  });
});
