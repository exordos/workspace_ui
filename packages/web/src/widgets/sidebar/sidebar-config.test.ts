/**
 * Tests for sidebarConfigStore — persists sidebar UI preferences.
 *
 * Currently manages the activityOpen toggle (whether the Activity section is
 * expanded). Persisted to localStorage so the sidebar remembers its state
 * across page reloads.
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
  useSidebarConfigStore.setState({ activityOpen: false, expandedStreamSlug: null });
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

  // Default state defines the first-launch experience.
  describe("default state", () => {
    // Activity section should be collapsed by default to reduce left-rail noise.
    it("starts with activityOpen = false", () => {
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    it("starts with no expanded stream slug", () => {
      expect(useSidebarConfigStore.getState().expandedStreamSlug).toBeNull();
    });

    it("loads collapsed default from storage when localStorage is empty", async () => {
      window.localStorage.clear();
      vi.resetModules();
      const { useSidebarConfigStore: freshStore } = await import("./sidebar-config.model");
      expect(freshStore.getState().activityOpen).toBe(false);
    });
  });

  // setActivityOpen is the direct setter for the Activity section toggle.
  describe("setActivityOpen", () => {
    // User collapses the section — must be reflected immediately.
    it("sets activityOpen to false", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    // Re-expanding must restore the open state.
    it("sets activityOpen to true", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      useSidebarConfigStore.getState().setActivityOpen(true);
      expect(useSidebarConfigStore.getState().activityOpen).toBe(true);
    });

    // Preference must survive page reload via localStorage.
    it("persists to localStorage", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activityOpen).toBe(false);
    });
  });

  describe("setExpandedStreamSlug", () => {
    it("stores expanded stream slug", () => {
      useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");
      expect(useSidebarConfigStore.getState().expandedStreamSlug).toBe("11-engineering");
    });

    it("allows clearing expanded stream slug", () => {
      useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");
      useSidebarConfigStore.getState().setExpandedStreamSlug(null);
      expect(useSidebarConfigStore.getState().expandedStreamSlug).toBeNull();
    });

    it("persists expanded stream slug to localStorage", () => {
      useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.expandedStreamSlug).toBe("11-engineering");
    });
  });

  // setConfig applies a partial patch — used for bulk config updates.
  describe("setConfig", () => {
    // Partial patch must override only the specified keys.
    it("applies a partial config patch", () => {
      useSidebarConfigStore.getState().setConfig({ activityOpen: false });
      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });

    // Patched config must also be persisted.
    it("persists patched config to localStorage", () => {
      useSidebarConfigStore
        .getState()
        .setConfig({ activityOpen: false, expandedStreamSlug: "11-engineering" });

      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(stored.activityOpen).toBe(false);
      expect(stored.expandedStreamSlug).toBe("11-engineering");
    });

    // Empty patch (no keys) must not reset any fields — safe no-op.
    it("empty patch preserves existing state", () => {
      useSidebarConfigStore.getState().setActivityOpen(false);
      useSidebarConfigStore.getState().setConfig({});

      expect(useSidebarConfigStore.getState().activityOpen).toBe(false);
    });
  });

  describe("organization scope", () => {
    it("persists sidebar config under active organization id", () => {
      setInstanceScope(["org-a"], "org-a");
      useSidebarConfigStore.getState().setExpandedStreamSlug("11-engineering");

      const scopedRaw = window.localStorage.getItem("zulip-web-sidebar-config:org-a");
      expect(scopedRaw).not.toBeNull();
      const stored = JSON.parse(scopedRaw!);
      expect(stored.expandedStreamSlug).toBe("11-engineering");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("loads sidebar config for the newly selected organization", () => {
      window.localStorage.setItem(
        "zulip-web-sidebar-config:org-a",
        JSON.stringify({ activityOpen: true, expandedStreamSlug: "11-engineering" }),
      );
      window.localStorage.setItem(
        "zulip-web-sidebar-config:org-b",
        JSON.stringify({ activityOpen: false, expandedStreamSlug: "22-product" }),
      );

      setInstanceScope(["org-a", "org-b"], "org-a");
      expect(useSidebarConfigStore.getState().expandedStreamSlug).toBe("11-engineering");

      useInstancesStore.getState().setCurrentInstanceId("org-b");
      expect(useSidebarConfigStore.getState().expandedStreamSlug).toBe("22-product");
    });
  });
});
