import { useEffect } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  captureActiveOrgRequestContext,
  isActiveOrgRequestInvalidated,
  useInstancesStore,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { fetchUser } from "~/shared/api/zulip-users";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

export function useChatPartnerProfileHydration(options: {
  partnerUserId: number | null;
  isDmView: boolean;
  isGroupDmView: boolean;
}): void {
  const { partnerUserId, isDmView, isGroupDmView } = options;
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);

  // Load partner profile in DM (avatar, name, presence)
  useEffect(() => {
    if (!partnerUserId || !isDmView || isGroupDmView) return;
    const controller = new AbortController();
    const orgContext = captureActiveOrgRequestContext();
    fetchUser(partnerUserId, { signal: controller.signal })
      .then((user) => {
        if (!isActiveOrgRequestInvalidated(orgContext, controller.signal) && user) {
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
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        reportUnexpectedError("chat:partnerProfile", err, { partnerUserId });
      });
    return () => {
      controller.abort();
    };
  }, [partnerUserId, isDmView, isGroupDmView, currentInstanceId]);
}
