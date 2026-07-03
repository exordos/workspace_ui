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

  it("extracts persistable Workspace messenger paths without org prefix", () => {
    expect(
      extractPersistableMessengerChatPath(
        "/org/acme/project/project-a/stream/86edc085-cb69-4dfd-8fcb-2f4388c2e301/topic/381189d7-61c2-45e8-b88a-9c9b75af1994",
      ),
    ).toBe(
      "/project/project-a/stream/86edc085-cb69-4dfd-8fcb-2f4388c2e301/topic/381189d7-61c2-45e8-b88a-9c9b75af1994",
    );
    expect(extractPersistableMessengerChatPath("/org/acme/project/project-a/messenger")).toBe(
      "/project/project-a/messenger",
    );
  });

  it("ignores non-chat messenger sections", () => {
    expect(extractPersistableMessengerChatPath("/org/acme/calendar")).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/inbox")).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/activity/starred")).toBeNull();
  });

  it("does not persist legacy routes", () => {
    expect(
      extractPersistableMessengerChatPath("/org/acme/stream/5-engineering/topic/bugs"),
    ).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/dm/12-34")).toBeNull();
    expect(extractPersistableMessengerChatPath("/org/acme/message/12345")).toBeNull();
    expect(extractPersistableMessengerChatPath("/message/12345")).toBeNull();
  });

  it("persists and restores last route per instance", () => {
    saveLastMessengerRoute("inst-a", "/project/project-a/stream/stream-uuid");
    saveLastMessengerRoute("inst-b", "/project/project-b/message/message-uuid");

    expect(loadLastMessengerRoute("inst-a")).toBe("/project/project-a/stream/stream-uuid");
    expect(loadLastMessengerRoute("inst-b")).toBe("/project/project-b/message/message-uuid");
    expect(resolveMessengerNavigationPath({ instanceId: "inst-a", projectId: "project-a" })).toBe(
      "/project/project-a/stream/stream-uuid",
    );
  });

  it("falls back to project messenger root when nothing saved", () => {
    expect(
      resolveMessengerNavigationPath({ instanceId: "missing", projectId: "engineering" }),
    ).toBe("/project/engineering/messenger");
    expect(resolveMessengerNavigationPath({ instanceId: null, projectId: "project-a" })).toBe(
      "/project/project-a/messenger",
    );
  });

  it("falls back to app root without Workspace project", () => {
    expect(resolveMessengerNavigationPath({ instanceId: "inst-a", projectId: null })).toBe("/");
    expect(resolveMessengerNavigationPath({ instanceId: "inst-a", projectId: " " })).toBe("/");
  });

  it("does not restore a saved route from another project", () => {
    saveLastMessengerRoute("inst-a", "/project/project-a/stream/stream-uuid");

    expect(resolveMessengerNavigationPath({ instanceId: "inst-a", projectId: "project-b" })).toBe(
      "/project/project-b/messenger",
    );
  });

  it("exposes tray open sentinel route", () => {
    expect(TRAY_MESSENGER_OPEN_ROUTE).toBe("/open/messenger");
  });

  it("ignores non-persistable paths on save", () => {
    saveLastMessengerRoute("inst-a", "/calendar");
    saveLastMessengerRoute("inst-a", "/inbox");
    saveLastMessengerRoute("inst-a", "/stream/1-general");
    saveLastMessengerRoute("inst-a", "/dm/42");
    expect(loadLastMessengerRoute("inst-a")).toBeNull();
  });

  it("recovers from corrupted localStorage payload", () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("workspace-last-messenger-route", "{not-json");
    }
    expect(loadLastMessengerRoute("inst-a")).toBeNull();
    saveLastMessengerRoute("inst-a", "/project/project-a/stream/stream-uuid");
    expect(loadLastMessengerRoute("inst-a")).toBe("/project/project-a/stream/stream-uuid");
  });
});
