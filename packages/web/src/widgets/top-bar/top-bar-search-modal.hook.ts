import { useCallback } from "react";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
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
  onSelectUserUuid: (userUuid: string) => boolean;
} {
  const { navigate, mode = "zulip", pathname = "" } = options;
  const open = useSearchModalStore((s) => s.open);
  const setOpen = useSearchModalStore((s) => s.setOpen);
  const closeModal = useSearchModalStore((s) => s.closeModal);

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

  return { open, setOpen, onSelectUserUuid };
}
