/**
 * Instances store — manages Zulip server connections.
 *
 * Persists realm URLs, credentials, and active instance selection to localStorage.
 */
import { create } from "zustand";
import { normalizeRealm } from "~/shared/api/zulip-realm.internal";
import { clearAvatarBlobCacheForInstance } from "~/shared/lib/avatar-blob-cache-db";
import { logAction, logStoreAction } from "~/shared/lib/logger";

const INSTANCES_STORAGE_KEY = "zulip-web-instances";
const CURRENT_INSTANCE_KEY = "zulip-web-current-instance";
const UNREAD_BY_INSTANCE_KEY = "zulip-web-instance-unread-counts";

export type ZulipAuthType = "api_key" | "session";

export interface ZulipInstance {
  id: string;
  realm: string;
  email: string;
  apiKey: string;
  userId?: number;
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

export interface ActiveOrgRequestContext {
  instanceId: string | null;
  epoch: number;
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

function normalizeUserId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
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
      userId: normalizeUserId(record.userId),
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

function realmHostFromRealm(realm: string): string {
  try {
    const normalized = /^https?:\/\//i.test(realm) ? realm : `https://${realm}`;
    return new URL(normalized).hostname;
  } catch {
    return "unknown";
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

export type AddInstanceResult =
  | { status: "added"; id: string }
  | { status: "duplicate"; id: string };

function addInstanceDuplicateKey(keys: Set<string>, realmLike: string, email: string): void {
  const normalizedRealm = normalizeRealm(realmLike).toLowerCase();
  if (normalizedRealm.length === 0) {
    return;
  }
  keys.add(`${normalizedRealm}::${email}`);
}

function getInstanceDuplicateKeys(
  instance: Pick<ZulipInstance, "realm" | "email" | "workspaceOrgOrigin">,
): Set<string> {
  const email = instance.email.trim().toLowerCase();
  const keys = new Set<string>();
  addInstanceDuplicateKey(keys, instance.realm, email);

  const workspaceOrgOrigin = instance.workspaceOrgOrigin?.trim() ?? "";
  if (workspaceOrgOrigin.length > 0) {
    addInstanceDuplicateKey(keys, workspaceOrgOrigin, email);
  }
  return keys;
}

function findDuplicateInstance(
  instances: ZulipInstance[],
  candidate: Pick<ZulipInstance, "realm" | "email" | "workspaceOrgOrigin">,
): ZulipInstance | undefined {
  const candidateKeys = getInstanceDuplicateKeys(candidate);
  return instances.find((instance) => {
    const instanceKeys = getInstanceDuplicateKeys(instance);
    for (const key of candidateKeys) {
      if (instanceKeys.has(key)) {
        return true;
      }
    }
    return false;
  });
}

interface InstancesState extends StoredState {
  activeOrgEpoch: number;
  /** DM unread per instance (in-memory; used for dock/tray/favicon badges). */
  dmUnreadCountsByInstance: Record<string, number>;
  /** Effective Jitsi base URL from last Zulip register for the active instance (not persisted). */
  jitsiMeetBaseUrl: string | null;
  setJitsiMeetBaseUrl: (url: string | null) => void;
  addInstance: (instance: Omit<ZulipInstance, "id">) => AddInstanceResult;
  removeInstance: (id: string) => void;
  setCurrentInstanceId: (id: string | null) => void;
  setInstanceUserId: (id: string, userId: number) => void;
  getCurrentInstance: () => ZulipInstance | null;
  setInstanceUnreadCount: (id: string, unreadCount: number) => void;
  getInstanceUnreadCount: (id: string) => number;
  setInstanceDmUnreadCount: (id: string, dmUnreadCount: number) => void;
  getInstanceDmUnreadCount: (id: string) => number;
}

export const useInstancesStore = create<InstancesState>((set, get) => ({
  ...loadFromStorage(),
  activeOrgEpoch: 0,
  dmUnreadCountsByInstance: {},
  jitsiMeetBaseUrl: null,

  setJitsiMeetBaseUrl: (url) => {
    const next = url != null && url.trim() !== "" ? url.trim().replace(/\/+$/, "") : null;
    logStoreAction("instances", "setJitsiMeetBaseUrl", { hasUrl: next != null });
    set({ jitsiMeetBaseUrl: next });
  },

  addInstance: (instance) => {
    const duplicate = findDuplicateInstance(get().instances, instance);
    if (duplicate) {
      const duplicateResult: AddInstanceResult = { status: "duplicate", id: duplicate.id };
      logStoreAction("instances", "addInstanceDuplicate", { instanceId: duplicateResult.id });
      return duplicateResult;
    }

    const id = generateId();
    const newInstance: ZulipInstance = {
      ...instance,
      id,
      userId: normalizeUserId(instance.userId),
      authType: normalizeAuthType(instance.authType),
    };

    set((state) => {
      const instances = [...state.instances, newInstance];
      const currentInstanceId = state.currentInstanceId ?? id;
      const activeOrgEpoch =
        currentInstanceId === state.currentInstanceId
          ? state.activeOrgEpoch
          : state.activeOrgEpoch + 1;
      const unreadCountsByInstance = { ...state.unreadCountsByInstance };
      persist(instances, currentInstanceId, unreadCountsByInstance);
      return { instances, currentInstanceId, activeOrgEpoch, unreadCountsByInstance };
    });

    const addedResult: AddInstanceResult = { status: "added", id };
    logStoreAction("instances", "addInstance", { instanceId: addedResult.id });
    logAction("instance_added", {
      instanceId: addedResult.id,
      realmHost: realmHostFromRealm(newInstance.realm),
    });
    return addedResult;
  },

  removeInstance: (id) => {
    const removedRealm = get().instances.find((i) => i.id === id)?.realm;
    set((state) => {
      const removedWasCurrent = state.currentInstanceId === id;
      const instances = state.instances.filter((i) => i.id !== id);
      let currentInstanceId = state.currentInstanceId;
      if (currentInstanceId === id) {
        currentInstanceId = instances[0]?.id ?? null;
      }
      const activeOrgEpoch =
        currentInstanceId === state.currentInstanceId
          ? state.activeOrgEpoch
          : state.activeOrgEpoch + 1;
      const unreadCountsByInstance = { ...state.unreadCountsByInstance };
      delete unreadCountsByInstance[id];
      const dmUnreadCountsByInstance = { ...state.dmUnreadCountsByInstance };
      delete dmUnreadCountsByInstance[id];
      persist(instances, currentInstanceId, unreadCountsByInstance);
      return {
        instances,
        currentInstanceId,
        activeOrgEpoch,
        unreadCountsByInstance,
        dmUnreadCountsByInstance,
        ...(removedWasCurrent ? { jitsiMeetBaseUrl: null as string | null } : {}),
      };
    });
    logStoreAction("instances", "removeInstance", { instanceId: id });
    void clearAvatarBlobCacheForInstance(id);
    logAction("instance_removed", {
      instanceId: id,
      ...(removedRealm ? { realmHost: realmHostFromRealm(removedRealm) } : {}),
    });
  },

  setInstanceUserId: (id, userId) => {
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }
    set((state) => {
      const index = state.instances.findIndex((instance) => instance.id === id);
      if (index < 0 || state.instances[index]?.userId === userId) {
        return state;
      }
      const instances = state.instances.map((instance) =>
        instance.id === id ? { ...instance, userId } : instance,
      );
      persist(instances, state.currentInstanceId, state.unreadCountsByInstance);
      return { instances };
    });
    logStoreAction("instances", "setInstanceUserId", { instanceId: id, userId });
  },

  setCurrentInstanceId: (id) => {
    const previousId = get().currentInstanceId;
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
        activeOrgEpoch: switched ? state.activeOrgEpoch + 1 : state.activeOrgEpoch,
        instances,
        ...(switched ? { jitsiMeetBaseUrl: null as string | null } : {}),
      };
    });
    if (id !== previousId) {
      const targetRealm = id != null ? get().instances.find((i) => i.id === id)?.realm : undefined;
      logStoreAction("instances", "setCurrentInstanceId", { instanceId: id });
      logAction("instance_switched", {
        instanceId: id,
        previousInstanceId: previousId,
        ...(targetRealm ? { realmHost: realmHostFromRealm(targetRealm) } : {}),
      });
    }
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

  setInstanceDmUnreadCount: (id, dmUnreadCount) => {
    set((state) => {
      if (!state.instances.some((instance) => instance.id === id)) return state;

      const safeUnread = toSafeUnreadCount(dmUnreadCount);
      if ((state.dmUnreadCountsByInstance[id] ?? 0) === safeUnread) {
        return state;
      }

      const dmUnreadCountsByInstance = { ...state.dmUnreadCountsByInstance, [id]: safeUnread };
      logStoreAction("instances", "setInstanceDmUnreadCount", { id, dmUnreadCount: safeUnread });
      return { dmUnreadCountsByInstance };
    });
  },

  getInstanceDmUnreadCount: (id) => get().dmUnreadCountsByInstance[id] ?? 0,
}));

export function captureActiveOrgRequestContext(): ActiveOrgRequestContext {
  const { currentInstanceId, activeOrgEpoch } = useInstancesStore.getState();
  return {
    instanceId: currentInstanceId,
    epoch: activeOrgEpoch,
  };
}

export function isActiveOrgRequestContextCurrent(context: ActiveOrgRequestContext): boolean {
  const { currentInstanceId, activeOrgEpoch } = useInstancesStore.getState();
  return currentInstanceId === context.instanceId && activeOrgEpoch === context.epoch;
}

/**
 * Loader coordination rules:
 * - use requestVersion for ordering inside one active organization;
 * - use active-org context before every organization-scoped store or IDB write;
 * - thread AbortSignal when work is tied to component/store lifecycle or costly network I/O.
 */
export function isActiveOrgRequestInvalidated(
  context: ActiveOrgRequestContext,
  signal?: AbortSignal,
): boolean {
  return signal?.aborted === true || !isActiveOrgRequestContextCurrent(context);
}
