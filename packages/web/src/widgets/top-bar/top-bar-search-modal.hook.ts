import { useCallback } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { buildRouteFromMessage } from "~/shared/lib/push-click";
import {
  parseWorkspaceMessengerRoute,
  workspaceMessengerStreamRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { useSearchModalStore } from "~/widgets/search-modal/search-modal.model";
import type { SearchModalMode } from "~/widgets/search-modal/search-modal.types";
import type { NavigateFunction } from "react-router-dom";

export function useTopBarSearchModal(options: {
  navigate: NavigateFunction;
  mode?: SearchModalMode;
  pathname?: string;
}): {
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser: (userId: number) => void;
  onSelectUserUuid: (userUuid: string) => boolean;
} {
  const { navigate, mode = "zulip", pathname = "" } = options;
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

  const onSelectUserUuid = useCallback(
    (userUuid: string) => {
      const workspaceRoute = parseWorkspaceMessengerRoute(pathname);
      if (mode !== "workspace" || workspaceRoute == null) {
        return false;
      }

      const messengerState = useMessengerStore.getState();
      const directStream = messengerState.streamIds
        .map((streamId) => messengerState.streamsById[streamId])
        .find((stream) => stream?.directUserUuid === userUuid);
      const directConversation =
        directStream == null
          ? messengerState.conversationIds
              .map((conversationId) => messengerState.conversationsById[conversationId])
              .find((conversation) => conversation?.directUserUuid === userUuid)
          : null;
      const streamUuid = directStream?.uuid ?? directConversation?.streamUuid;
      if (streamUuid == null) {
        return false;
      }

      closeModal();
      void navigate(
        workspaceMessengerStreamRoute({
          orgId: workspaceRoute.orgId,
          projectId: workspaceRoute.projectId,
          streamUuid,
        }),
      );
      return true;
    },
    [closeModal, mode, navigate, pathname],
  );

  return { open, setOpen, onSelectMessage, onSelectUser, onSelectUserUuid };
}
