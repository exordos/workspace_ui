import { useEffect } from "react";
import { useUserProfileStore } from "~/features/user-profile/user-profile.model";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export function useLayoutUserProfileAutoload(options: {
  currentInstanceId: string | null;
  rightDrawerOpen: boolean;
  rightDrawerMode: "info" | "settings" | "user-menu" | "about" | "builds";
  rightDrawerTargetUserId: UserId | undefined;
}): void {
  const { currentInstanceId, rightDrawerMode, rightDrawerTargetUserId, rightDrawerOpen } = options;

  useEffect(() => {
    const numericTargetUserId = numericUserIdOrNull(rightDrawerTargetUserId);
    if (
      rightDrawerMode === "settings" ||
      rightDrawerMode === "user-menu" ||
      rightDrawerMode === "about" ||
      rightDrawerMode === "builds" ||
      numericTargetUserId == null ||
      !rightDrawerOpen
    ) {
      useUserProfileStore.getState().clear();
      return;
    }

    const controller = new AbortController();
    void useUserProfileStore.getState().loadProfile(numericTargetUserId, {
      signal: controller.signal,
    });
    return () => {
      controller.abort();
      useUserProfileStore.getState().clear();
    };
  }, [currentInstanceId, rightDrawerMode, rightDrawerTargetUserId, rightDrawerOpen]);
}
