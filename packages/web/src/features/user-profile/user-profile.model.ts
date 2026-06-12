/**
 * User profile store — manages loading and display of a single user's profile.
 */

import { create } from "zustand";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestInvalidated,
} from "~/entities/instance/instance.model";
import { requestUserStatus } from "~/entities/user/api/user.api";
import { useUsersStore } from "~/entities/user/user.model";
import { logStoreAction } from "~/shared/lib/logger";
import { fetchUserProfile as apiFetchUserProfile } from "./user-profile.api";
import type { UserProfileData } from "./user-profile.types";

export type UserProfileStatus = "idle" | "loading" | "done" | "error";

interface UserProfileState {
  profile: UserProfileData | null;
  status: UserProfileStatus;
  error: string | null;
  requestVersion: number;

  loadProfile: (userId: number, options?: { signal?: AbortSignal }) => Promise<void>;
  clear: () => void;
}

const INITIAL_STATE = {
  profile: null as UserProfileData | null,
  status: "idle" as UserProfileStatus,
  error: null as string | null,
  requestVersion: 0,
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  ...INITIAL_STATE,

  async loadProfile(userId, options) {
    logStoreAction("user-profile", "loadProfile", { userId });
    const requestVersion = get().requestVersion + 1;
    const orgContext = captureActiveOrgRequestContext();
    set({ status: "loading", error: null, requestVersion });

    try {
      const result = await apiFetchUserProfile(userId, options);
      if (
        get().requestVersion !== requestVersion ||
        isActiveOrgRequestInvalidated(orgContext, options?.signal)
      ) {
        return;
      }
      if (result) {
        useUsersStore.getState().mergeUser({
          user_id: result.userId,
          full_name: result.fullName,
          email: result.email,
          avatar_url: result.avatarUrl,
          role: result.role,
          is_active: result.isActive,
        });
        void requestUserStatus(result.userId, { reason: "right_panel", priority: "high" });
        set({ profile: result, status: "done" });
        return;
      }
      set({ status: "error", error: "Failed to load user profile" });
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        return;
      }
      if (
        get().requestVersion !== requestVersion ||
        isActiveOrgRequestInvalidated(orgContext, options?.signal)
      ) {
        return;
      }
      set({ status: "error", error: "Failed to load user profile" });
    }
  },

  clear() {
    logStoreAction("user-profile", "clear", {});
    set((state) => ({
      ...INITIAL_STATE,
      requestVersion: state.requestVersion + 1,
    }));
  },
}));
