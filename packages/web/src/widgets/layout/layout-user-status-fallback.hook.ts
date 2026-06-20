import { useEffect } from "react";
import { requestUserStatus } from "~/entities/user/api/user.api";
import { numericUserIdOrNull, type UserId } from "~/shared/lib/user-id.lib";

export function useLayoutUserStatusFallback(options: {
  enabled: boolean;
  currentUserId: UserId | null;
  partnerUserId: UserId | undefined;
  rightDrawerOpen: boolean;
  rightDrawerTargetUserId: UserId | undefined;
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
    const numericCurrentUserId = numericUserIdOrNull(currentUserId);
    if (!enabled || numericCurrentUserId == null) return;
    void requestUserStatus(numericCurrentUserId, { reason: "top_bar", priority: "high" });
  }, [enabled, currentUserId]);

  useEffect(() => {
    const numericPartnerUserId = numericUserIdOrNull(partnerUserId);
    if (!enabled || numericPartnerUserId == null) return;
    void requestUserStatus(numericPartnerUserId, { reason: "dm_header", priority: "high" });
  }, [enabled, partnerUserId]);

  useEffect(() => {
    const numericTargetUserId = numericUserIdOrNull(rightDrawerTargetUserId);
    if (!enabled || !rightDrawerOpen || numericTargetUserId == null) return;
    void requestUserStatus(numericTargetUserId, { reason: "right_panel", priority: "high" });
  }, [enabled, rightDrawerOpen, rightDrawerTargetUserId]);

  useEffect(() => {
    if (!enabled || !rightDrawerOpen) return;
    for (const userId of rightPanelMemberStatusIds) {
      void requestUserStatus(userId, { reason: "right_panel", priority: "low" });
    }
  }, [enabled, rightDrawerOpen, rightPanelMemberStatusIds]);
}
