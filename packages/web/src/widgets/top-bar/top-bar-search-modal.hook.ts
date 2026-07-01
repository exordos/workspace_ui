import { useCallback } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildRouteFromMessage } from "~/shared/lib/push-click";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import type { SearchModalMode } from "~/widgets/search-modal/search-modal.types";
import type { NavigateFunction } from "react-router-dom";

export function useTopBarSearchModal(options: {
  navigate: NavigateFunction;
  mode?: SearchModalMode;
}): {
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser: (userId: number) => void;
} {
  const { navigate, mode = "zulip" } = options;
  const open = useSearchModalStore((s) => s.open);
  const setOpen = useSearchModalStore((s) => s.setOpen);
  const closeModal = useSearchModalStore((s) => s.closeModal);

  const onSelectMessage = useCallback(
    (msg: MockMessage) => {
      if (mode === "workspace") {
        closeModal();
        return;
      }
      const currentUserId = useChatListStore.getState().currentUserId ?? null;
      const route = buildRouteFromMessage(msg, currentUserId);
      if (route) {
        closeModal();
        void navigate(route);
      }
    },
    [navigate, closeModal, mode],
  );

  const onSelectUser = useCallback(
    (userId: number) => {
      closeModal();
      void navigate(withCurrentOrgRoute(`/users/${userId}`));
    },
    [navigate, closeModal],
  );

  return { open, setOpen, onSelectMessage, onSelectUser };
}
