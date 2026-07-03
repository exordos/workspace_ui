import { useEffect } from "react";

export function useLayoutUserStatusFallback(options: {
  enabled: boolean;
  currentUserId: number | null;
  partnerUserId: number | undefined;
  rightDrawerOpen: boolean;
  rightDrawerTargetUserId: number | undefined;
  rightPanelMemberStatusIds: number[];
}): void {
  const { enabled } = options;

  useEffect(() => {
    void enabled;
  }, [enabled]);
}
