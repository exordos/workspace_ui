import { describe, expect, it } from "vitest";
import {
  isLegacyMessengerPathname,
  isWorkspaceMessengerRoute,
  parseWorkspaceMessengerMessageAnchor,
  parseWorkspaceMessengerRoute,
  workspaceActivityRoute,
  workspaceFeedRoute,
  workspaceInboxRoute,
  workspaceMessengerRootRoute,
  workspaceMessengerMessageAnchor,
} from "./workspace-messenger-route.lib";

describe("workspace-messenger-route", () => {
  it("builds project-scoped messenger activity routes", () => {
    expect(workspaceMessengerRootRoute("org-a", "project-a")).toBe(
      "/org/org-a/project/project-a/messenger",
    );
    expect(workspaceInboxRoute("org-a", "project-a")).toBe("/org/org-a/project/project-a/inbox");
    expect(
      workspaceActivityRoute({ orgId: "org-a", projectId: "project-a", filter: "starred" }),
    ).toBe("/org/org-a/project/project-a/activity/starred");
    expect(workspaceFeedRoute("org-a", "project-a")).toBe("/org/org-a/project/project-a/feed");
  });

  it("parses project Inbox and activity routes as Workspace messenger runtime", () => {
    expect(parseWorkspaceMessengerRoute("/org/org-a/project/project-a/inbox")).toEqual({
      kind: "inbox",
      orgId: "org-a",
      projectId: "project-a",
    });
    expect(parseWorkspaceMessengerRoute("/org/org-a/project/project-a/activity/mentions")).toEqual({
      kind: "activity",
      orgId: "org-a",
      projectId: "project-a",
      filter: "mentions",
    });
    expect(parseWorkspaceMessengerRoute("/org/org-a/project/project-a/feed")).toEqual({
      kind: "feed",
      orgId: "org-a",
      projectId: "project-a",
    });
  });

  it("does not treat old org Inbox as Workspace messenger runtime", () => {
    expect(isWorkspaceMessengerRoute("/org/org-a/inbox")).toBe(false);
    expect(isWorkspaceMessengerRoute("/org/org-a/project/project-a/inbox")).toBe(true);
  });

  it("identifies legacy messenger paths without matching Workspace paths", () => {
    expect(isLegacyMessengerPathname("/stream/general")).toBe(true);
    expect(isLegacyMessengerPathname("/org/org-a/dm/42")).toBe(true);
    expect(isLegacyMessengerPathname("/org/org-a/inbox")).toBe(true);
    expect(isLegacyMessengerPathname("/org/org-a/project/project-a/inbox")).toBe(false);
    expect(isLegacyMessengerPathname("/org/org-a/project/project-a/stream/stream-uuid")).toBe(
      false,
    );
  });

  it("builds and parses message anchors independently from the chat route", () => {
    const messageUuid = "55555555-5555-4555-8555-555555555555";

    expect(workspaceMessengerMessageAnchor(messageUuid)).toBe(`#message-${messageUuid}`);
    expect(parseWorkspaceMessengerMessageAnchor(`#message-${messageUuid}`)).toBe(messageUuid);
    expect(parseWorkspaceMessengerMessageAnchor(`message-${messageUuid}`)).toBe(messageUuid);
    expect(parseWorkspaceMessengerMessageAnchor("#message-")).toBeNull();
    expect(parseWorkspaceMessengerMessageAnchor("#section-settings")).toBeNull();
  });
});
