/**
 * Tests for sidebarConfigStore — persists sidebar UI preferences.
 *
 * Covers activity toggle and expanded stream topics state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useSidebarConfigStore } from "./sidebar-config.model";

const STORAGE_KEY = "zulip-web-sidebar-config";

function resetStore() {
  window.localStorage.clear();
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
  useSidebarConfigStore.setState({ activityOpen: false, expandedStreamSlugs: [] });
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

    it("starts with no expanded stream slugs", () => {
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual([]);
    });

    it("loads collapsed default from storage when localStorage is empty", async () => {
      window.localStorage.clear();
      vi.resetModules();
      const { useSidebarConfigStore: freshStore } = await import("./sidebar-config.model");
      expect(freshStore.getState().activityOpen).toBe(false);
      expect(freshStore.getState().expandedStreamSlugs).toEqual([]);
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

  describe("expanded stream slugs", () => {
    it("toggles stream slug in expanded list", () => {
      useSidebarConfigStore.getState().toggleExpandedStreamSlug("11-engineering");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual(["11-engineering"]);

      useSidebarConfigStore.getState().toggleExpandedStreamSlug("11-engineering");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual([]);
    });

    it("expands stream slug idempotently", () => {
      useSidebarConfigStore.getState().expandStreamSlug("11-engineering");
      useSidebarConfigStore.getState().expandStreamSlug("11-engineering");
      useSidebarConfigStore.getState().expandStreamSlug("22-product");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual([
        "11-engineering",
        "22-product",
      ]);
    });

    it("collapses all expanded stream slugs except target", () => {
      useSidebarConfigStore.getState().setConfig({
        expandedStreamSlugs: ["11-engineering", "22-product", "33-support"],
      });
      useSidebarConfigStore.getState().collapseExpandedStreamsExcept("22-product");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual(["22-product"]);
    });

    it("collapses all expanded stream slugs", () => {
      useSidebarConfigStore.getState().setConfig({
        expandedStreamSlugs: ["11-engineering", "22-product"],
      });
      useSidebarConfigStore.getState().collapseAllExpandedStreams();
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual([]);
    });

    it("persists expanded stream slugs to localStorage", () => {
      useSidebarConfigStore
        .getState()
        .setConfig({ expandedStreamSlugs: ["11-engineering", "22-product"] });

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.expandedStreamSlugs).toEqual(["11-engineering", "22-product"]);
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
        .setConfig({ activityOpen: false, expandedStreamSlugs: ["11-engineering"] });

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activityOpen).toBe(false);
      expect(stored.expandedStreamSlugs).toEqual(["11-engineering"]);
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
      useSidebarConfigStore.getState().expandStreamSlug("11-engineering");

      const scopedRaw = window.localStorage.getItem("zulip-web-sidebar-config:org-a");
      expect(scopedRaw).not.toBeNull();
      const stored = JSON.parse(scopedRaw!);
      expect(stored.expandedStreamSlugs).toEqual(["11-engineering"]);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("loads sidebar config for the newly selected organization", () => {
      window.localStorage.setItem(
        "zulip-web-sidebar-config:org-a",
        JSON.stringify({ activityOpen: true, expandedStreamSlugs: ["11-engineering"] }),
      );
      window.localStorage.setItem(
        "zulip-web-sidebar-config:org-b",
        JSON.stringify({ activityOpen: false, expandedStreamSlugs: ["22-product"] }),
      );

      setInstanceScope(["org-a", "org-b"], "org-a");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual(["11-engineering"]);

      useInstancesStore.getState().setCurrentInstanceId("org-b");
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual(["22-product"]);
    });

    it("ignores legacy single-slug shape from localStorage", () => {
      window.localStorage.setItem(
        "zulip-web-sidebar-config:org-a",
        JSON.stringify({ activityOpen: true, expandedStreamSlug: "11-engineering" }),
      );

      setInstanceScope(["org-a"], "org-a");

      expect(useSidebarConfigStore.getState().activityOpen).toBe(true);
      expect(useSidebarConfigStore.getState().expandedStreamSlugs).toEqual([]);
    });
  });
});
