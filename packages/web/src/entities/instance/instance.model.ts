/**
 * Instances store — manages Zulip server connections.
 *
 * Persists realm URLs, credentials, and active instance selection to localStorage.
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

const INSTANCES_STORAGE_KEY = "zulip-web-instances";
const CURRENT_INSTANCE_KEY = "zulip-web-current-instance";
const UNREAD_BY_INSTANCE_KEY = "zulip-web-instance-unread-counts";

export type ZulipAuthType = "api_key" | "session";

export interface ZulipInstance {
  id: string;
  realm: string;
  email: string;
  apiKey: string;
  authType?: ZulipAuthType;
  realmIcon?: string;
  /** Workspace REST origin from the server URL entered at login (not canonical Zulip realm). */
  workspaceOrgOrigin?: string;
}

interface StoredState {
  instances: ZulipInstance[];
  currentInstanceId: string | null;
  unreadCountsByInstance: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toSafeUnreadCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeAuthType(value: unknown): ZulipAuthType {
  return value === "session" ? "session" : "api_key";
}

function normalizeStoredInstances(value: unknown): ZulipInstance[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: ZulipInstance[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate == null) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.realm !== "string" ||
      typeof record.email !== "string" ||
      typeof record.apiKey !== "string"
    ) {
      continue;
    }
    const workspaceOrgOriginRaw = record.workspaceOrgOrigin;
    normalized.push({
      id: record.id,
      realm: record.realm,
      email: record.email,
      apiKey: record.apiKey,
      authType: normalizeAuthType(record.authType),
      realmIcon: typeof record.realmIcon === "string" ? record.realmIcon : undefined,
      workspaceOrgOrigin:
        typeof workspaceOrgOriginRaw === "string" && workspaceOrgOriginRaw.trim() !== ""
          ? workspaceOrgOriginRaw.trim()
          : undefined,
    });
  }
  return normalized;
}

function filterUnreadCountsByInstances(
  instances: ZulipInstance[],
  unreadCountsByInstance: Record<string, unknown>,
): Record<string, number> {
  const knownIds = new Set(instances.map((instance) => instance.id));
  const filtered: Record<string, number> = {};

  for (const [instanceId, count] of Object.entries(unreadCountsByInstance)) {
    if (!knownIds.has(instanceId)) continue;
    filtered[instanceId] = toSafeUnreadCount(count);
  }

  return filtered;
}

function loadFromStorage(): StoredState {
  if (typeof window === "undefined") {
    return { instances: [], currentInstanceId: null, unreadCountsByInstance: {} };
  }
  try {
    const raw = window.localStorage.getItem(INSTANCES_STORAGE_KEY);
    const instances = normalizeStoredInstances(raw ? (JSON.parse(raw) as unknown) : []);
    const currentId = window.localStorage.getItem(CURRENT_INSTANCE_KEY);
    const unreadRaw = window.localStorage.getItem(UNREAD_BY_INSTANCE_KEY);
    const parsedUnread: unknown = unreadRaw ? JSON.parse(unreadRaw) : {};
    const unreadCountsByInstance = filterUnreadCountsByInstances(
      instances,
      isRecord(parsedUnread) ? parsedUnread : {},
    );
    const currentInstanceId =
      currentId && instances.some((i) => i.id === currentId) ? currentId : null;
    return {
      instances,
      currentInstanceId: currentInstanceId ?? instances[0]?.id ?? null,
      unreadCountsByInstance,
    };
  } catch {
    return { instances: [], currentInstanceId: null, unreadCountsByInstance: {} };
  }
}

function persist(
  instances: ZulipInstance[],
  currentInstanceId: string | null,
  unreadCountsByInstance: Record<string, number>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTANCES_STORAGE_KEY, JSON.stringify(instances));
    window.localStorage.setItem(
      UNREAD_BY_INSTANCE_KEY,
      JSON.stringify(filterUnreadCountsByInstances(instances, unreadCountsByInstance)),
    );
    if (currentInstanceId) {
      window.localStorage.setItem(CURRENT_INSTANCE_KEY, currentInstanceId);
    } else {
      window.localStorage.removeItem(CURRENT_INSTANCE_KEY);
    }
  } catch {
    /* quota exceeded or restricted storage */
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface InstancesState extends StoredState {
  /** Effective Jitsi base URL from last Zulip register for the active instance (not persisted). */
  jitsiMeetBaseUrl: string | null;
  setJitsiMeetBaseUrl: (url: string | null) => void;
  addInstance: (instance: Omit<ZulipInstance, "id">) => string;
  removeInstance: (id: string) => void;
  setCurrentInstanceId: (id: string | null) => void;
  getCurrentInstance: () => ZulipInstance | null;
  setInstanceUnreadCount: (id: string, unreadCount: number) => void;
  getInstanceUnreadCount: (id: string) => number;
}

export const useInstancesStore = create<InstancesState>((set, get) => ({
  ...loadFromStorage(),
  jitsiMeetBaseUrl: null,

  setJitsiMeetBaseUrl: (url) => {
    const next = url != null && url.trim() !== "" ? url.trim().replace(/\/+$/, "") : null;
    logStoreAction("instances", "setJitsiMeetBaseUrl", { hasUrl: next != null });
    set({ jitsiMeetBaseUrl: next });
  },

  addInstance: (instance) => {
    const id = generateId();
    const newInstance: ZulipInstance = {
      ...instance,
      id,
      authType: normalizeAuthType(instance.authType),
    };
    set((state) => {
      const instances = [...state.instances, newInstance];
      const currentInstanceId = state.currentInstanceId ?? id;
      const unreadCountsByInstance = { ...state.unreadCountsByInstance };
      persist(instances, currentInstanceId, unreadCountsByInstance);
      return { instances, currentInstanceId, unreadCountsByInstance };
    });
    return id;
  },

  removeInstance: (id) => {
    set((state) => {
      const removedWasCurrent = state.currentInstanceId === id;
      const instances = state.instances.filter((i) => i.id !== id);
      let currentInstanceId = state.currentInstanceId;
      if (currentInstanceId === id) {
        currentInstanceId = instances[0]?.id ?? null;
      }
      const unreadCountsByInstance = { ...state.unreadCountsByInstance };
      delete unreadCountsByInstance[id];
      persist(instances, currentInstanceId, unreadCountsByInstance);
      return {
        instances,
        currentInstanceId,
        unreadCountsByInstance,
        ...(removedWasCurrent ? { jitsiMeetBaseUrl: null as string | null } : {}),
      };
    });
  },

  setCurrentInstanceId: (id) => {
    set((state) => {
      if (id && !state.instances.some((i) => i.id === id)) return state;
      const instances =
        id == null
          ? state.instances
          : [
              state.instances.find((instance) => instance.id === id)!,
              ...state.instances.filter((instance) => instance.id !== id),
            ];
      persist(instances, id, state.unreadCountsByInstance);
      const switched = id !== state.currentInstanceId;
      return {
        currentInstanceId: id,
        instances,
        ...(switched ? { jitsiMeetBaseUrl: null as string | null } : {}),
      };
    });
  },

  getCurrentInstance: () => {
    const { instances, currentInstanceId } = get();
    if (!currentInstanceId) return null;
    return instances.find((i) => i.id === currentInstanceId) ?? null;
  },

  setInstanceUnreadCount: (id, unreadCount) => {
    set((state) => {
      if (!state.instances.some((instance) => instance.id === id)) return state;

      const safeUnread = toSafeUnreadCount(unreadCount);
      if ((state.unreadCountsByInstance[id] ?? 0) === safeUnread) {
        return state;
      }

      const unreadCountsByInstance = { ...state.unreadCountsByInstance, [id]: safeUnread };
      persist(state.instances, state.currentInstanceId, unreadCountsByInstance);
      return { unreadCountsByInstance };
    });
  },

  getInstanceUnreadCount: (id) => get().unreadCountsByInstance[id] ?? 0,
}));
