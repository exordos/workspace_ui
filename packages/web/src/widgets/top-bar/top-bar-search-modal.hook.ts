import { useCallback } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildRouteFromMessage } from "~/shared/lib/push-click";
import type { UserId } from "~/shared/lib/user-id.lib";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import type { NavigateFunction } from "react-router-dom";

export function useTopBarSearchModal(options: { navigate: NavigateFunction }): {
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser: (userId: UserId) => void;
} {
  const { navigate } = options;
  const open = useSearchModalStore((s) => s.open);
  const setOpen = useSearchModalStore((s) => s.setOpen);
  const closeModal = useSearchModalStore((s) => s.closeModal);

  const onSelectMessage = useCallback(
    (msg: MockMessage) => {
      const currentUserId = useChatListStore.getState().currentUserId ?? null;
      const route = buildRouteFromMessage(msg, currentUserId);
      if (route) {
        closeModal();
        void navigate(route);
      }
    },
    [navigate, closeModal],
  );

  const onSelectUser = useCallback(
    (userId: UserId) => {
      closeModal();
      void navigate(withCurrentOrgRoute(`/users/${encodeURIComponent(String(userId))}`));
    },
    [navigate, closeModal],
  );

  return { open, setOpen, onSelectMessage, onSelectUser };
}
