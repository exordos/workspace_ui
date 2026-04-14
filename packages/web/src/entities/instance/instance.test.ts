/**
 * Tests for instancesStore — manages Zulip server instances (multi-account support).
 *
 * Each instance holds realm URL, email, and API key. The store persists to
 * localStorage so credentials survive page reload. Correctness here is critical
 * because a bug means users lose access to their accounts or leak credentials.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useInstancesStore } from "./instance.model";

const INSTANCES_KEY = "zulip-web-instances";
const CURRENT_KEY = "zulip-web-current-instance";
const UNREAD_BY_INSTANCE_KEY = "zulip-web-instance-unread-counts";

function resetStore() {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    unreadCountsByInstance: {},
  });
  window.localStorage.clear();
}

// Verifies CRUD operations, instance switching, and localStorage persistence.
describe("instancesStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  // addInstance is the entry point for multi-account — called after successful login.
  describe("addInstance", () => {
    // First instance must auto-select as current so the app loads immediately.
    it("adds an instance and sets it as current when none existed", () => {
      const { addInstance } = useInstancesStore.getState();
      const id = addInstance({ realm: "https://z.test", email: "a@b.com", apiKey: "k1" });

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(1);
      expect(state.instances[0]!.id).toBe(id);
      expect(state.instances[0]!.realm).toBe("https://z.test");
      expect(state.currentInstanceId).toBe(id);
    });

    it("defaults auth type to api_key", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://z.test", email: "a@b.com", apiKey: "k1" });

      const state = useInstancesStore.getState();
      expect(state.instances.find((instance) => instance.id === id)?.authType).toBe("api_key");
    });

    it("keeps explicit session auth type when provided", () => {
      const id = useInstancesStore.getState().addInstance({
        realm: "https://z.test",
        email: "session-user@example.com",
        apiKey: "",
        authType: "session",
      });

      const state = useInstancesStore.getState();
      expect(state.instances.find((instance) => instance.id === id)?.authType).toBe("session");
    });

    // Adding a second account must not switch away from the active one.
    it("adds a second instance without changing current", () => {
      const { addInstance } = useInstancesStore.getState();
      const id1 = addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const id2 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(2);
      expect(state.currentInstanceId).toBe(id1);
      expect(id2).not.toBe(id1);
    });

    // IDs must be unique to avoid instance collision in the Map.
    it("generates unique ids", () => {
      const { addInstance } = useInstancesStore.getState();
      const id1 = addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const id2 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });

      expect(id1).not.toBe(id2);
    });
  });

  // removeInstance handles account logout / deletion.
  describe("removeInstance", () => {
    // Removing the current instance must auto-select the next one.
    it("removes an instance and resets current to first remaining", () => {
      const { addInstance } = useInstancesStore.getState();
      const id1 = addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const id2 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });

      useInstancesStore.getState().removeInstance(id1);

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(1);
      expect(state.instances[0]!.id).toBe(id2);
      expect(state.currentInstanceId).toBe(id2);
    });

    // Removing the last instance leaves a null selection — shows login screen.
    it("sets current to null when last instance is removed", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().removeInstance(id);

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(0);
      expect(state.currentInstanceId).toBeNull();
    });

    // Removing a non-active instance must not affect the current selection.
    it("does not change current when removing a non-current instance", () => {
      const id1 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const id2 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });

      useInstancesStore.getState().removeInstance(id2);

      expect(useInstancesStore.getState().currentInstanceId).toBe(id1);
      expect(useInstancesStore.getState().instances).toHaveLength(1);
    });
  });

  // Switching instances triggers data reload — must only accept valid IDs.
  describe("setCurrentInstanceId / switchInstance", () => {
    // Valid ID must update the selection immediately.
    it("switches to a valid instance id", () => {
      useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const id2 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });

      useInstancesStore.getState().setCurrentInstanceId(id2);

      expect(useInstancesStore.getState().currentInstanceId).toBe(id2);
    });

    // Invalid IDs (e.g. from corrupted localStorage) must be silently ignored.
    it("ignores setting current to an id that does not exist", () => {
      const id1 = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().setCurrentInstanceId("nonexistent");

      expect(useInstancesStore.getState().currentInstanceId).toBe(id1);
    });

    // Null is valid — used during logout to deselect all instances.
    it("allows setting current to null", () => {
      useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().setCurrentInstanceId(null);

      expect(useInstancesStore.getState().currentInstanceId).toBeNull();
    });

    it("reorders instances by latest user selection", () => {
      const idA = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      const idB = useInstancesStore
        .getState()
        .addInstance({ realm: "https://b.test", email: "b@b.com", apiKey: "k2" });
      const idC = useInstancesStore
        .getState()
        .addInstance({ realm: "https://c.test", email: "c@c.com", apiKey: "k3" });

      useInstancesStore.getState().setCurrentInstanceId(idB);
      expect(useInstancesStore.getState().instances.map((instance) => instance.id)).toEqual([
        idB,
        idA,
        idC,
      ]);

      useInstancesStore.getState().setCurrentInstanceId(idC);
      expect(useInstancesStore.getState().instances.map((instance) => instance.id)).toEqual([
        idC,
        idB,
        idA,
      ]);
    });
  });

  // getCurrentInstance is used by API client and auth middleware.
  describe("getCurrentInstance", () => {
    // Must return the full instance object with realm, email, and apiKey.
    it("returns the current instance when one is selected", () => {
      useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      const current = useInstancesStore.getState().getCurrentInstance();

      expect(current).not.toBeNull();
      expect(current!.realm).toBe("https://a.test");
      expect(current!.email).toBe("a@a.com");
    });

    // No selection means no authenticated API calls — callers must handle null.
    it("returns null when no instance is selected", () => {
      expect(useInstancesStore.getState().getCurrentInstance()).toBeNull();
    });

    // Orphaned ID (e.g. after data corruption) must not crash — returns null.
    it("returns null when currentInstanceId does not match any instance", () => {
      useInstancesStore.setState({ instances: [], currentInstanceId: "ghost" });

      expect(useInstancesStore.getState().getCurrentInstance()).toBeNull();
    });
  });

  // Persistence ensures credentials survive page reload / app restart.
  describe("localStorage persistence", () => {
    // After adding an instance, localStorage must contain the serialized data.
    it("persists instances to localStorage on add", () => {
      useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].realm).toBe("https://a.test");
    });

    it("persists workspaceOrgOrigin when present", () => {
      useInstancesStore.getState().addInstance({
        realm: "https://z.test",
        email: "a@a.com",
        apiKey: "k1",
        workspaceOrgOrigin: "https://gw.example.com",
      });
      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored[0].workspaceOrgOrigin).toBe("https://gw.example.com");
    });

    // The active instance ID is stored separately so it survives independently.
    it("persists current instance id to localStorage", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      expect(window.localStorage.getItem(CURRENT_KEY)).toBe(id);
    });

    // Null selection must clean up the localStorage key entirely.
    it("removes current instance key from localStorage when set to null", () => {
      useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });
      useInstancesStore.getState().setCurrentInstanceId(null);

      expect(window.localStorage.getItem(CURRENT_KEY)).toBeNull();
    });

    // Instance removal must be reflected in localStorage so reload doesn't restore it.
    it("persists removal to localStorage", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().removeInstance(id);

      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored).toHaveLength(0);
    });
  });

  describe("per-instance unread counters", () => {
    it("stores unread counters per instance and persists them", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().setInstanceUnreadCount(id, 7);

      expect(useInstancesStore.getState().getInstanceUnreadCount(id)).toBe(7);
      const raw = window.localStorage.getItem(UNREAD_BY_INSTANCE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? "{}")).toMatchObject({ [id]: 7 });
    });

    it("removes unread counters when instance is removed", () => {
      const id = useInstancesStore
        .getState()
        .addInstance({ realm: "https://a.test", email: "a@a.com", apiKey: "k1" });

      useInstancesStore.getState().setInstanceUnreadCount(id, 3);
      useInstancesStore.getState().removeInstance(id);

      expect(useInstancesStore.getState().getInstanceUnreadCount(id)).toBe(0);
      expect(JSON.parse(window.localStorage.getItem(UNREAD_BY_INSTANCE_KEY) ?? "{}")).toEqual({});
    });

    it("ignores unread updates for unknown instance ids", () => {
      useInstancesStore.getState().setInstanceUnreadCount("missing", 5);
      expect(useInstancesStore.getState().getInstanceUnreadCount("missing")).toBe(0);
    });
  });
});
