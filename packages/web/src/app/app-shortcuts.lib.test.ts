import { afterEach, describe, expect, it } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  clearLastMessengerRoutes,
  saveLastMessengerRoute,
} from "~/shared/lib/last-messenger-route.lib";
import { setCurrentOrgRouteIdResolver } from "~/shared/lib/org-route";
import { resolveGlobalNavigationRoute, type GlobalNavigationActionId } from "./app-shortcuts.lib";

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
    expect(resolveGlobalNavigationRoute("navigation.messenger")).toBe("/org/chat.example.com");
    expect(resolveGlobalNavigationRoute("navigation.calls")).toBe("/org/chat.example.com/calls");
  });

  it("maps global navigation shortcuts to expected routes", () => {
    const cases: { key: GlobalNavigationActionId; route: string }[] = [
      { key: "navigation.messenger", route: "/" },
      { key: "navigation.calendar", route: "/calendar" },
      { key: "navigation.mail", route: "/mail" },
      { key: "navigation.calls", route: "/calls" },
      { key: "navigation.activity", route: "/" },
    ];

    for (const item of cases) {
      expect(resolveGlobalNavigationRoute(item.key)).toBe(item.route);
    }
  });

  it("uses Workspace project root for messenger route", () => {
    setWorkspaceRuntime("project-a", "inst-1");

    expect(resolveGlobalNavigationRoute("navigation.messenger")).toBe(
      "/project/project-a/messenger",
    );
  });

  it("uses Workspace project activity route for activity shortcut", () => {
    setWorkspaceRuntime("project-a", "inst-1");

    expect(resolveGlobalNavigationRoute("navigation.activity")).toBe(
      "/org/chat.example.com/project/project-a/activity/favorites",
    );
  });

  it("opens last messenger chat for the messenger action when saved for instance", () => {
    setCurrentOrgRouteIdResolver(() => "chat.example.com");
    setWorkspaceRuntime("project-a", "inst-1");
    saveLastMessengerRoute("inst-1", "/project/project-a/stream/stream-uuid");

    expect(resolveGlobalNavigationRoute("navigation.messenger", "inst-1")).toBe(
      "/org/chat.example.com/project/project-a/stream/stream-uuid",
    );
  });
});
