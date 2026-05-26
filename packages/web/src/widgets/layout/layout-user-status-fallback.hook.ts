import { useEffect } from "react";
import { requestUserStatus } from "~/entities/user/api/user.api";

export function useLayoutUserStatusFallback(options: {
  enabled: boolean;
  currentUserId: number | null;
  partnerUserId: number | undefined;
  rightDrawerOpen: boolean;
  rightDrawerTargetUserId: number | undefined;
  rightPanelMemberStatusIds: number[];
}): void {
  const {
    enabled,
    currentUserId,
    partnerUserId,
    rightDrawerOpen,
    rightDrawerTargetUserId,
    rightPanelMemberStatusIds,
  } = options;

  useEffect(() => {
    if (!enabled || currentUserId == null) return;
    void requestUserStatus(currentUserId, { reason: "top_bar", priority: "high" });
  }, [enabled, currentUserId]);

  useEffect(() => {
    if (!enabled || partnerUserId == null) return;
    void requestUserStatus(partnerUserId, { reason: "dm_header", priority: "high" });
  }, [enabled, partnerUserId]);

  useEffect(() => {
    if (!enabled || !rightDrawerOpen || rightDrawerTargetUserId == null) return;
    void requestUserStatus(rightDrawerTargetUserId, { reason: "right_panel", priority: "high" });
  }, [enabled, rightDrawerOpen, rightDrawerTargetUserId]);

  useEffect(() => {
    if (!enabled || !rightDrawerOpen) return;
    for (const userId of rightPanelMemberStatusIds) {
      void requestUserStatus(userId, { reason: "right_panel", priority: "low" });
    }
  }, [enabled, rightDrawerOpen, rightPanelMemberStatusIds]);
}
