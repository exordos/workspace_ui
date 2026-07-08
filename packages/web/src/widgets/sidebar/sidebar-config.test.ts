/**
 * Tests for sidebarConfigStore — persists sidebar UI preferences.
 *
 * Covers activity toggle and expanded stream topics state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useSidebarConfigStore } from "./sidebar-config.model";

const STORAGE_KEY = "workspace-sidebar-config";

function resetStore() {
  window.localStorage.clear();
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
  useSidebarConfigStore.setState({ activityOpen: false, expandedStreamUuids: [] });
}

function setInstanceScope(instanceIds: string[], currentInstanceId: string): void {
  useInstancesStore.setState({
    instances: instanceIds.map((id) => ({
      id,
      realm: `https://${id}.example.com`,
      email: `${id}@example.com`,
      apiKey: `key-${id}`,
    })),
    currentInstanceId,
    unreadCountsByInstance: {},
  });
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

  describe("organization scope", () => {
    it("persists sidebar config under active organization id", () => {
      setInstanceScope(["org-a"], "org-a");
      useSidebarConfigStore.getState().expandStreamUuid("11-engineering");

      const scopedRaw = window.localStorage.getItem("workspace-sidebar-config:org-a");
      expect(scopedRaw).not.toBeNull();
      const stored = JSON.parse(scopedRaw!);
      expect(stored.expandedStreamUuids).toEqual(["11-engineering"]);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("loads sidebar config for the newly selected organization", () => {
      window.localStorage.setItem(
        "workspace-sidebar-config:org-a",
        JSON.stringify({ activityOpen: true, expandedStreamUuids: ["11-engineering"] }),
      );
      window.localStorage.setItem(
        "workspace-sidebar-config:org-b",
        JSON.stringify({ activityOpen: false, expandedStreamUuids: ["22-product"] }),
      );

      setInstanceScope(["org-a", "org-b"], "org-a");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["11-engineering"]);

      useInstancesStore.getState().setCurrentInstanceId("org-b");
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual(["22-product"]);
    });

    it("ignores legacy single-stream shape from localStorage", () => {
      window.localStorage.setItem(
        "workspace-sidebar-config:org-a",
        JSON.stringify({ activityOpen: true, expandedStreamUuid: "11-engineering" }),
      );

      setInstanceScope(["org-a"], "org-a");

      expect(useSidebarConfigStore.getState().activityOpen).toBe(true);
      expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    });
  });
});
