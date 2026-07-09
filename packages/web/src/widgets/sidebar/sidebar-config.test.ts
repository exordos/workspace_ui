/**
 * Tests for sidebarConfigStore — persists sidebar UI preferences.
 *
 * Covers activity toggle and expanded stream topics state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useSidebarConfigStore } from "./sidebar-config.model";

const STORAGE_KEY = "workspace-sidebar-config";

function resetStore() {
  window.localStorage.clear();
  useWorkspaceAuthStore.setState({
    sessions: [],
    currentAccountId: null,
    runtimeGeneration: 0,
  });
  useSidebarConfigStore.setState({ activityOpen: false, expandedStreamUuids: [] });
}

function createSession(id: "a" | "b"): WorkspaceAuthSession {
  return {
    accountId: `account-${id}`,
    instanceId: `instance-${id}`,
    organizationId: `org-${id}`,
    organizationOrigin: `https://org-${id}.example.com`,
    projectId: `project-${id}`,
    userUuid: `user-${id}`,
    accessToken: `access-token-${id}`,
    refreshToken: `refresh-token-${id}`,
    runtimeGeneration: 1,
    login: `user-${id}@example.com`,
    profile: {
      uuid: `user-${id}`,
      username: `user-${id}`,
      firstName: "User",
      lastName: id.toUpperCase(),
      email: `user-${id}@example.com`,
    },
  };
}

function setWorkspaceSessionScope(currentAccountId: "account-a" | "account-b"): {
  sessionA: WorkspaceAuthSession;
  sessionB: WorkspaceAuthSession;
} {
  const sessionA = createSession("a");
  const sessionB = createSession("b");
  useWorkspaceAuthStore.setState({
    sessions: [sessionA, sessionB],
    currentAccountId,
    runtimeGeneration: 1,
  });
  return { sessionA, sessionB };
}

// Verifies default state, direct setter, partial config patch, and localStorage sync.
describe("sidebarConfigStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  describe("default state", () => {
    it("starts with activityOpen = false", () => {
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    it("starts with no expanded stream UUIDs", () => {
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    });

    it("loads collapsed default from storage when localStorage is empty", async () => {
      window.localStorage.clear();
      vi.resetModules();
      const { useSidebarConfigStore: freshStore } = await import("./sidebar-config.model");
      expect(freshStore.getState().activityOpen).toBe(false);
      expect(freshStore.getState().expandedStreamUuids).toEqual([]);
    });
  });

  describe("setActivityOpen", () => {
    it("sets activityOpen to false", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    it("sets activityOpen to true", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      useSidebarConfigStore.getState().setActivityOpen(true);
      expect(useSidebarConfigStore.getState().activityOpen).toBe(true);
    });

    it("persists to localStorage", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activityOpen).toBe(false);
    });
  });

  describe("expanded stream UUIDs", () => {
    it("toggles stream UUID in expanded list", () => {
      useSidebarConfigStore.getState().toggleExpandedStreamUuid("11-engineering");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["11-engineering"]);

      useSidebarConfigStore.getState().toggleExpandedStreamUuid("11-engineering");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    });

    it("expands stream UUID idempotently", () => {
      useSidebarConfigStore.getState().expandStreamUuid("11-engineering");
      useSidebarConfigStore.getState().expandStreamUuid("11-engineering");
      useSidebarConfigStore.getState().expandStreamUuid("22-product");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([
        "11-engineering",
        "22-product",
      ]);
    });

    it("collapses all expanded stream UUIDs except target", () => {
      useSidebarConfigStore.getState().setConfig({
        expandedStreamUuids: ["11-engineering", "22-product", "33-support"],
      });
      useSidebarConfigStore.getState().collapseExpandedStreamsExcept("22-product");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["22-product"]);
    });

    it("collapses all expanded stream UUIDs", () => {
      useSidebarConfigStore.getState().setConfig({
        expandedStreamUuids: ["11-engineering", "22-product"],
      });
      useSidebarConfigStore.getState().collapseAllExpandedStreams();
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    });

    it("persists expanded stream UUIDs to localStorage", () => {
      useSidebarConfigStore
        .getState()
        .setConfig({ expandedStreamUuids: ["11-engineering", "22-product"] });

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.expandedStreamUuids).toEqual(["11-engineering", "22-product"]);
    });
  });

  describe("setConfig", () => {
    it("applies a partial config patch", () => {
      useSidebarConfigStore.getState().setConfig({ activityOpen: false });
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    it("persists patched config to localStorage", () => {
      useSidebarConfigStore
        .getState()
        .setConfig({ activityOpen: false, expandedStreamUuids: ["11-engineering"] });

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activityOpen).toBe(false);
      expect(stored.expandedStreamUuids).toEqual(["11-engineering"]);
    });

    it("empty patch preserves existing state", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      useSidebarConfigStore.getState().setConfig({});

      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });
  });

  describe("workspace owner scope", () => {
    it("persists sidebar config under active workspace owner key", () => {
      const { sessionA } = setWorkspaceSessionScope("account-a");
      const ownerKey = workspaceRuntimeOwnerKey(sessionA);
      useSidebarConfigStore.getState().expandStreamUuid("11-engineering");

      const scopedRaw = window.localStorage.getItem(`workspace-sidebar-config:${ownerKey}`);
      expect(scopedRaw).not.toBeNull();
      const stored = JSON.parse(scopedRaw!);
      expect(stored.expandedStreamUuids).toEqual(["11-engineering"]);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("loads sidebar config for the newly selected workspace account", () => {
      const sessionA = createSession("a");
      const sessionB = createSession("b");
      const ownerAKey = workspaceRuntimeOwnerKey(sessionA);
      const ownerBKey = workspaceRuntimeOwnerKey(sessionB);
      window.localStorage.setItem(
        `workspace-sidebar-config:${ownerAKey}`,
        JSON.stringify({ activityOpen: true, expandedStreamUuids: ["11-engineering"] }),
      );
      window.localStorage.setItem(
        `workspace-sidebar-config:${ownerBKey}`,
        JSON.stringify({ activityOpen: false, expandedStreamUuids: ["22-product"] }),
      );

      setWorkspaceSessionScope("account-a");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["11-engineering"]);

      useWorkspaceAuthStore.getState().setCurrentAccountId("account-b");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["22-product"]);
    });

    it("ignores legacy single-stream shape from localStorage", () => {
      window.localStorage.setItem(
        "workspace-sidebar-config:instance-a",
        JSON.stringify({ activityOpen: true, expandedStreamUuid: "11-engineering" }),
      );

      setWorkspaceSessionScope("account-a");

      expect(useSidebarConfigStore.getState().activityOpen).toBe(true);
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    });

    it("reads legacy instance-scoped config without writing back to legacy keys", () => {
      const sessionA = createSession("a");
      window.localStorage.setItem(
        "workspace-sidebar-config:instance-a",
        JSON.stringify({ activityOpen: true, expandedStreamUuids: ["11-engineering"] }),
      );

      setWorkspaceSessionScope("account-a");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["11-engineering"]);

      useSidebarConfigStore.getState().expandStreamUuid("22-product");

      const ownerKey = workspaceRuntimeOwnerKey(sessionA);
      const stored = JSON.parse(
        window.localStorage.getItem(`workspace-sidebar-config:${ownerKey}`)!,
      );
      expect(stored.expandedStreamUuids).toEqual(["11-engineering", "22-product"]);
      const legacyStored = JSON.parse(
        window.localStorage.getItem("workspace-sidebar-config:instance-a")!,
      );
      expect(legacyStored.expandedStreamUuids).toEqual(["11-engineering"]);
    });
  });
});
