import { useEffect } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchUser } from "~/shared/api/zulip-users";

export function useChatPartnerProfileHydration(options: {
  partnerUserId: number | null;
  isDmView: boolean;
  isGroupDmView: boolean;
}): void {
  const { partnerUserId, isDmView, isGroupDmView } = options;

  // Load partner profile in DM (avatar, name, presence)
  useEffect(() => {
    if (!partnerUserId || !isDmView || isGroupDmView) return;
    let cancelled = false;
    fetchUser(partnerUserId)
      .then((user) => {
        if (!cancelled && user) {
          useUsersStore.getState().mergeUser({
            user_id: user.user_id,
            full_name: user.full_name ?? "",
            email: user.email,
            avatar_url: user.avatar_url ?? undefined,
            is_active: user.is_active,
          });
          useChatListStore.getState().patchPersonalDmRowLabelsForUser(user.user_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partnerUserId, isDmView, isGroupDmView]);
}
