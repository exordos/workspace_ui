import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

interface WorkspaceJitsiSettingsState {
  meetUrlsByOwnerKey: Record<string, string>;
  setWorkspaceMeetUrl: (ownerKey: string, meetUrl: string | null | undefined) => void;
  getWorkspaceMeetUrl: (ownerKey: string | null | undefined) => string | null;
  clear: () => void;
}

export function normalizeWorkspaceMeetUrl(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export const useWorkspaceJitsiSettingsStore = create<WorkspaceJitsiSettingsState>((set, get) => ({
  meetUrlsByOwnerKey: {},

  setWorkspaceMeetUrl(ownerKey, meetUrl) {
    const safeOwnerKey = ownerKey.trim();
    if (safeOwnerKey.length === 0) return;

    const normalizedMeetUrl = normalizeWorkspaceMeetUrl(meetUrl);
    logStoreAction("workspaceJitsiSettings", "setWorkspaceMeetUrl", {
      hasOwnerKey: true,
      hasMeetUrl: normalizedMeetUrl != null,
    });

    set((state) => {
      const nextMeetUrlsByOwnerKey = { ...state.meetUrlsByOwnerKey };
      if (normalizedMeetUrl == null) {
        delete nextMeetUrlsByOwnerKey[safeOwnerKey];
      } else {
        nextMeetUrlsByOwnerKey[safeOwnerKey] = normalizedMeetUrl;
      }
      return { meetUrlsByOwnerKey: nextMeetUrlsByOwnerKey };
    });
  },

  getWorkspaceMeetUrl(ownerKey) {
    const safeOwnerKey = ownerKey?.trim() ?? "";
    if (safeOwnerKey.length === 0) return null;
    return get().meetUrlsByOwnerKey[safeOwnerKey] ?? null;
  },

  clear() {
    logStoreAction("workspaceJitsiSettings", "clear", {});
    set({ meetUrlsByOwnerKey: {} });
  },
}));
