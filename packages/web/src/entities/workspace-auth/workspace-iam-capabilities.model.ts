import { create } from "zustand";

export type WorkspaceIamCapabilitiesStatus = "idle" | "loading" | "ready" | "error";

export interface WorkspaceIamCapabilitiesState {
  ownerKey: string | null;
  runtimeGeneration: number | null;
  permissions: readonly string[] | null;
  status: WorkspaceIamCapabilitiesStatus;
  error: string | null;
  lastLoadedAtMs: number | null;
  requestGeneration: number;
  invalidationVersion: number;
  startLoad: (ownerKey: string, runtimeGeneration: number) => number;
  finishLoad: (
    ownerKey: string,
    runtimeGeneration: number,
    requestGeneration: number,
    permissions: readonly string[],
    loadedAtMs?: number,
  ) => boolean;
  failLoad: (
    ownerKey: string,
    runtimeGeneration: number,
    requestGeneration: number,
    error: string,
  ) => boolean;
  invalidate: (ownerKey: string) => boolean;
  clear: () => void;
}

const INITIAL_STATE = {
  ownerKey: null,
  runtimeGeneration: null,
  permissions: null,
  status: "idle" as const,
  error: null,
  lastLoadedAtMs: null,
  requestGeneration: 0,
  invalidationVersion: 0,
};

export const useWorkspaceIamCapabilitiesStore = create<WorkspaceIamCapabilitiesState>((set) => ({
  ...INITIAL_STATE,

  startLoad(ownerKey, runtimeGeneration) {
    let requestGeneration = 0;
    set((state) => {
      requestGeneration = state.requestGeneration + 1;
      if (state.ownerKey === ownerKey) {
        return {
          runtimeGeneration,
          requestGeneration,
          status: "loading" as const,
          error: null,
        };
      }
      return {
        ownerKey,
        runtimeGeneration,
        permissions: null,
        status: "loading" as const,
        error: null,
        lastLoadedAtMs: null,
        requestGeneration,
      };
    });
    return requestGeneration;
  },

  finishLoad(ownerKey, runtimeGeneration, requestGeneration, permissions, loadedAtMs = Date.now()) {
    let applied = false;
    set((state) => {
      if (
        state.ownerKey !== ownerKey ||
        state.runtimeGeneration !== runtimeGeneration ||
        state.requestGeneration !== requestGeneration
      ) {
        return state;
      }
      applied = true;
      return {
        permissions: [...permissions],
        status: "ready" as const,
        error: null,
        lastLoadedAtMs: loadedAtMs,
      };
    });
    return applied;
  },

  failLoad(ownerKey, runtimeGeneration, requestGeneration, error) {
    let applied = false;
    set((state) => {
      if (
        state.ownerKey !== ownerKey ||
        state.runtimeGeneration !== runtimeGeneration ||
        state.requestGeneration !== requestGeneration
      ) {
        return state;
      }
      applied = true;
      return {
        permissions: null,
        status: "error" as const,
        error,
        lastLoadedAtMs: null,
      };
    });
    return applied;
  },

  invalidate(ownerKey) {
    let applied = false;
    set((state) => {
      if (state.ownerKey !== ownerKey) return state;
      applied = true;
      return { invalidationVersion: state.invalidationVersion + 1 };
    });
    return applied;
  },

  clear() {
    set(INITIAL_STATE);
  },
}));

export function selectWorkspaceIamPermissionsForOwner(
  state: WorkspaceIamCapabilitiesState,
  ownerKey: string | null,
): readonly string[] | null {
  return ownerKey != null && state.ownerKey === ownerKey ? state.permissions : null;
}
