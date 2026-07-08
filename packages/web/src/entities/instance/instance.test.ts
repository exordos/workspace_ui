import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestContextCurrent,
  useInstancesStore,
} from "./instance.model";

const INSTANCES_KEY = "workspace-runtime-instances";
const CURRENT_KEY = "workspace-runtime-current-instance";
const UNREAD_BY_INSTANCE_KEY = "workspace-runtime-instance-unread-counts";

function resetStore() {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: null,
    activeOrgEpoch: 0,
    unreadCountsByInstance: {},
    dmUnreadCountsByInstance: {},
    jitsiMeetBaseUrl: null,
  });
  window.localStorage.clear();
}

describe("instancesStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  describe("addInstance", () => {
    it("adds an instance and sets it as current when none existed", () => {
      const result = useInstancesStore.getState().addInstance();

      const state = useInstancesStore.getState();
      expect(result.status).toBe("added");
      expect(state.instances).toEqual([{ id: result.id }]);
      expect(state.currentInstanceId).toBe(result.id);
    });

    it("stores valid user id when provided", () => {
      const id = useInstancesStore.getState().addInstance({ userId: 42 }).id;

      expect(
        useInstancesStore.getState().instances.find((instance) => instance.id === id)?.userId,
      ).toBe(42);
    });

    it("adds a second instance without changing current", () => {
      const first = useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(2);
      expect(state.currentInstanceId).toBe(first.id);
      expect(second.id).not.toBe(first.id);
    });
  });

  describe("removeInstance", () => {
    it("removes an instance and resets current to first remaining", () => {
      const first = useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().removeInstance(first.id);

      const state = useInstancesStore.getState();
      expect(state.instances).toEqual([{ id: second.id }]);
      expect(state.currentInstanceId).toBe(second.id);
    });

    it("sets current to null when last instance is removed", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().removeInstance(id);

      const state = useInstancesStore.getState();
      expect(state.instances).toHaveLength(0);
      expect(state.currentInstanceId).toBeNull();
    });

    it("does not change current when removing a non-current instance", () => {
      const first = useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().removeInstance(second.id);

      expect(useInstancesStore.getState().currentInstanceId).toBe(first.id);
      expect(useInstancesStore.getState().instances).toEqual([{ id: first.id }]);
    });
  });

  describe("setJitsiMeetBaseUrl", () => {
    it("stores normalized base URL and clears with null", () => {
      useInstancesStore.getState().setJitsiMeetBaseUrl("https://calls.example.com/");
      expect(useInstancesStore.getState().jitsiMeetBaseUrl).toBe("https://calls.example.com");

      useInstancesStore.getState().setJitsiMeetBaseUrl(null);
      expect(useInstancesStore.getState().jitsiMeetBaseUrl).toBeNull();
    });

    it("clears Jitsi URL when switching current instance", () => {
      useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().setJitsiMeetBaseUrl("https://jitsi.example.com");
      useInstancesStore.getState().setCurrentInstanceId(second.id);

      expect(useInstancesStore.getState().jitsiMeetBaseUrl).toBeNull();
      expect(useInstancesStore.getState().currentInstanceId).toBe(second.id);
    });
  });

  describe("setInstanceUserId", () => {
    it("updates an existing instance user id and persists it", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().setInstanceUserId(id, 77);

      expect(
        useInstancesStore.getState().instances.find((instance) => instance.id === id)?.userId,
      ).toBe(77);
      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored[0].userId).toBe(77);
    });

    it("ignores invalid user ids", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().setInstanceUserId(id, 0);

      expect(
        useInstancesStore.getState().instances.find((instance) => instance.id === id)?.userId,
      ).toBeUndefined();
    });
  });

  describe("setCurrentInstanceId", () => {
    it("switches to a valid instance id", () => {
      useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().setCurrentInstanceId(second.id);

      expect(useInstancesStore.getState().currentInstanceId).toBe(second.id);
    });

    it("ignores setting current to an id that does not exist", () => {
      const first = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().setCurrentInstanceId("nonexistent");

      expect(useInstancesStore.getState().currentInstanceId).toBe(first.id);
    });

    it("allows setting current to null", () => {
      useInstancesStore.getState().addInstance();

      useInstancesStore.getState().setCurrentInstanceId(null);

      expect(useInstancesStore.getState().currentInstanceId).toBeNull();
    });

    it("reorders instances by latest user selection", () => {
      const first = useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();
      const third = useInstancesStore.getState().addInstance();

      useInstancesStore.getState().setCurrentInstanceId(second.id);
      expect(useInstancesStore.getState().instances.map((instance) => instance.id)).toEqual([
        second.id,
        first.id,
        third.id,
      ]);

      useInstancesStore.getState().setCurrentInstanceId(third.id);
      expect(useInstancesStore.getState().instances.map((instance) => instance.id)).toEqual([
        third.id,
        second.id,
        first.id,
      ]);
    });

    it("increments activeOrgEpoch when the active instance changes", () => {
      const first = useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();
      const epochAfterAdd = useInstancesStore.getState().activeOrgEpoch;

      useInstancesStore.getState().setCurrentInstanceId(second.id);
      expect(useInstancesStore.getState().activeOrgEpoch).toBe(epochAfterAdd + 1);

      useInstancesStore.getState().setCurrentInstanceId(first.id);
      expect(useInstancesStore.getState().activeOrgEpoch).toBe(epochAfterAdd + 2);
    });

    it("does not increment activeOrgEpoch when current instance does not change", () => {
      const id = useInstancesStore.getState().addInstance().id;
      const epochBefore = useInstancesStore.getState().activeOrgEpoch;

      useInstancesStore.getState().setCurrentInstanceId(id);

      expect(useInstancesStore.getState().activeOrgEpoch).toBe(epochBefore);
    });

    it("increments activeOrgEpoch when switching to null", () => {
      useInstancesStore.getState().addInstance();
      const epochBefore = useInstancesStore.getState().activeOrgEpoch;

      useInstancesStore.getState().setCurrentInstanceId(null);

      expect(useInstancesStore.getState().activeOrgEpoch).toBe(epochBefore + 1);
    });
  });

  describe("active organization request context", () => {
    it("captures the current instance id and epoch", () => {
      const id = useInstancesStore.getState().addInstance().id;

      expect(captureActiveOrgRequestContext()).toEqual({
        instanceId: id,
        epoch: useInstancesStore.getState().activeOrgEpoch,
      });
    });

    it("reports a captured context as stale after switching instances", () => {
      useInstancesStore.getState().addInstance();
      const second = useInstancesStore.getState().addInstance();
      const context = captureActiveOrgRequestContext();

      expect(isActiveOrgRequestContextCurrent(context)).toBe(true);

      useInstancesStore.getState().setCurrentInstanceId(second.id);

      expect(isActiveOrgRequestContextCurrent(context)).toBe(false);
    });
  });

  describe("getCurrentInstance", () => {
    it("returns the current instance when one is selected", () => {
      const id = useInstancesStore.getState().addInstance({ userId: 42 }).id;

      expect(useInstancesStore.getState().getCurrentInstance()).toEqual({ id, userId: 42 });
    });

    it("returns null when no instance is selected", () => {
      expect(useInstancesStore.getState().getCurrentInstance()).toBeNull();
    });

    it("returns null when currentInstanceId does not match any instance", () => {
      useInstancesStore.setState({
        instances: [],
        currentInstanceId: "ghost",
        activeOrgEpoch: 0,
        jitsiMeetBaseUrl: null,
      });

      expect(useInstancesStore.getState().getCurrentInstance()).toBeNull();
    });
  });

  describe("localStorage persistence", () => {
    it("persists runtime instances to localStorage on add", () => {
      const id = useInstancesStore.getState().addInstance({ userId: 42 }).id;

      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored).toEqual([{ id, userId: 42 }]);
    });

    it("ignores invalid userId from localStorage", async () => {
      window.localStorage.setItem(
        INSTANCES_KEY,
        JSON.stringify([{ id: "stored-instance", userId: 0 }]),
      );
      window.localStorage.setItem(CURRENT_KEY, "stored-instance");

      vi.resetModules();
      const { useInstancesStore: freshStore } = await import("./instance.model");

      expect(freshStore.getState().instances[0]?.userId).toBeUndefined();
      vi.resetModules();
    });

    it("drops unsupported stored instance metadata", async () => {
      window.localStorage.setItem(
        INSTANCES_KEY,
        JSON.stringify([
          {
            id: "stored-instance",
            userId: 42,
            serverUrl: "https://legacy.test",
            credential: "secret",
          },
        ]),
      );
      window.localStorage.setItem(CURRENT_KEY, "stored-instance");

      vi.resetModules();
      const { useInstancesStore: freshStore } = await import("./instance.model");

      expect(freshStore.getState().instances).toEqual([{ id: "stored-instance", userId: 42 }]);
      vi.resetModules();
    });

    it("persists current instance id to localStorage", () => {
      const id = useInstancesStore.getState().addInstance().id;

      expect(window.localStorage.getItem(CURRENT_KEY)).toBe(id);
    });

    it("removes current instance key from localStorage when set to null", () => {
      useInstancesStore.getState().addInstance();
      useInstancesStore.getState().setCurrentInstanceId(null);

      expect(window.localStorage.getItem(CURRENT_KEY)).toBeNull();
    });

    it("persists removal to localStorage", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().removeInstance(id);

      const stored = JSON.parse(window.localStorage.getItem(INSTANCES_KEY) ?? "[]");
      expect(stored).toHaveLength(0);
    });
  });

  describe("per-instance unread counters", () => {
    it("stores unread counters per instance and persists them", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().setInstanceUnreadCount(id, 7);

      expect(useInstancesStore.getState().getInstanceUnreadCount(id)).toBe(7);
      const raw = window.localStorage.getItem(UNREAD_BY_INSTANCE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? "{}")).toMatchObject({ [id]: 7 });
    });

    it("normalizes invalid unread counters", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().setInstanceUnreadCount(id, -3);

      expect(useInstancesStore.getState().getInstanceUnreadCount(id)).toBe(0);
    });

    it("stores dm unread counters in memory", () => {
      const id = useInstancesStore.getState().addInstance().id;

      useInstancesStore.getState().setInstanceDmUnreadCount(id, 4);

      expect(useInstancesStore.getState().getInstanceDmUnreadCount(id)).toBe(4);
      expect(JSON.parse(window.localStorage.getItem(UNREAD_BY_INSTANCE_KEY) ?? "{}")).toEqual({});
    });

    it("removes unread counters when instance is removed", () => {
      const id = useInstancesStore.getState().addInstance().id;

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
