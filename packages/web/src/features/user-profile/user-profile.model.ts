/**
 * User profile store — manages loading and display of a single user's profile.
 */

import { create } from "zustand";
import { useUsersStore } from "~/entities/user/user.model";
import { logStoreAction } from "~/shared/lib/logger";
import { fetchUserProfile as apiFetchUserProfile } from "./user-profile.api";
import type { UserProfileData } from "./user-profile.types";

export type UserProfileStatus = "idle" | "loading" | "done" | "error";

interface UserProfileState {
  profile: UserProfileData | null;
  status: UserProfileStatus;
  error: string | null;

  loadProfile: (userId: number) => Promise<void>;
  clear: () => void;
}

const INITIAL_STATE = {
  profile: null as UserProfileData | null,
  status: "idle" as UserProfileStatus,
  error: null as string | null,
};

export const useUserProfileStore = create<UserProfileState>((set) => ({
  ...INITIAL_STATE,

  async loadProfile(userId) {
    logStoreAction("user-profile", "loadProfile", { userId });
    set({ status: "loading", error: null });

    const result = await apiFetchUserProfile(userId);
    if (result) {
      useUsersStore.getState().mergeUser({
        user_id: result.userId,
        full_name: result.fullName,
        email: result.email,
        avatar_url: result.avatarUrl,
        role: result.role,
        is_active: result.isActive,
      });
      set({ profile: result, status: "done" });
    } else {
      set({ status: "error", error: "Failed to load user profile" });
    }
  },

  clear() {
    logStoreAction("user-profile", "clear", {});
    set({ ...INITIAL_STATE });
  },
}));
