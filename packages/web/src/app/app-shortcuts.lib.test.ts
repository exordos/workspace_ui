import { afterEach, describe, expect, it } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  clearLastMessengerRoutes,
  saveLastMessengerRoute,
} from "~/shared/lib/last-messenger-route.lib";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import {
  resolveGlobalNavigationRoute,
  resolveGlobalShortcutAction,
  type GlobalNavigationShortcutKey,
} from "./app-shortcuts.lib";

describe("app-shortcuts", () => {
  afterEach(() => {
    setCurrentOrgRouteIdResolver(null);
    clearLastMessengerRoutes();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
  });

  function setWorkspaceRuntime(projectId = "project-a", instanceId = "inst-1"): void {
    const accountId = `account-${projectId}`;
    useWorkspaceAuthStore.setState({
      currentAccountId: accountId,
      runtimeGeneration: 1,
      sessions: [
        {
          accountId,
          instanceId,
          organizationId: "chat.example.com",
          organizationOrigin: "https://chat.example.com",
          projectId,
          userUuid: "user-a",
          login: "user@example.com",
          accessToken: "access-token",
          runtimeGeneration: 1,
          profile: {
            uuid: "user-a",
            username: "user",
            firstName: "User",
            lastName: null,
            email: "user@example.com",
          },
        },
      ],
    });
  }

  it("prefixes shortcut routes with current org scope", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    expect(resolveGlobalNavigationRoute("mod+1", "general")).toBe("/org/chat.example.com");
    expect(resolveGlobalNavigationRoute("mod+4", "general")).toBe("/org/chat.example.com/calls");
  });

  it("maps global navigation shortcuts to expected routes", () => {
    const cases: { key: GlobalNavigationShortcutKey; route: string }[] = [
      { key: "mod+1", route: "/" },
      { key: "mod+2", route: "/calendar" },
      { key: "mod+3", route: "/mail" },
      { key: "mod+4", route: "/calls" },
      { key: "mod+shift+a", route: "/" },
    ];

    for (const item of cases) {
      expect(resolveGlobalNavigationRoute(item.key, "general")).toBe(item.route);
    }
  });

  it("uses Workspace project root for messenger route", () => {
    setWorkspaceRuntime("project-a", "inst-1");

    expect(resolveGlobalNavigationRoute("mod+1", "engineering")).toBe(
      "/project/project-a/messenger",
    );
  });

  it("uses Workspace project activity route for activity shortcut", () => {
    setWorkspaceRuntime("project-a", "inst-1");

    expect(resolveGlobalNavigationRoute("mod+shift+a", "engineering")).toBe(
      "/org/chat.example.com/project/project-a/activity/starred",
    );
  });

  it("opens last messenger chat for mod+1 when saved for instance", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    setWorkspaceRuntime("project-a", "inst-1");
    saveLastMessengerRoute("inst-1", "/project/project-a/stream/stream-uuid");

    expect(resolveGlobalNavigationRoute("mod+1", "general", "inst-1")).toBe(
      "/org/chat.example.com/project/project-a/stream/stream-uuid",
    );
  });

  it("maps theme shortcut to non-navigation action", () => {
    expect(resolveGlobalShortcutAction("mod+shift+t", "general")).toEqual({ type: "toggle-theme" });
  });
});
