import { useEffect } from "react";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";

export function useLayoutUserProfileAutoload(options: {
  currentInstanceId: string | null;
  rightDrawerOpen: boolean;
  rightDrawerMode: "info" | "settings" | "user-menu" | "about" | "builds";
  rightDrawerTargetUserId: number | undefined;
}): void {
  const { currentInstanceId, rightDrawerMode, rightDrawerTargetUserId, rightDrawerOpen } = options;

  useEffect(() => {
    if (
      rightDrawerMode === "settings" ||
      rightDrawerMode === "user-menu" ||
      rightDrawerMode === "about" ||
      rightDrawerMode === "builds" ||
      rightDrawerTargetUserId == null ||
      !rightDrawerOpen
    ) {
      useUserProfileStore.getState().clear();
      return;
    }

    void useUserProfileStore.getState().loadProfile(rightDrawerTargetUserId);
    return () => {
      useUserProfileStore.getState().clear();
    };
  }, [currentInstanceId, rightDrawerMode, rightDrawerTargetUserId, rightDrawerOpen]);
}

