import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { readActiveChats, useChatsCatalog } from "~/applications/messenger/model/chats/chats";
import { useMessageIndex } from "~/applications/messenger/model/messages/messages-consumers";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { useUsersById, useUsersOwnerKey } from "~/modules/users/users";
import { writeText } from "~/shared/lib/clipboard";
import { toast } from "~/shared/lib/toast/toast";
import { selectEncryptedChatInfo } from "./encrypted-chat-info-selector.lib";

export function useEncryptedChatInfo(streamUuid: string, sendingKeyUuid: string | null = null) {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const ownerKey = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const catalogOwnerKey = useChatsCatalog((state) => state.ownerKey);
  const streamsById = useChatsCatalog((state) => state.streamsById);
  const bindingsById = useChatsCatalog((state) => state.streamBindingsById);
  const messagesOwnerKey = useMessageIndex((state) => state.ownerKey);
  const messagesById = useMessageIndex((state) => state.messagesById);
  const usersOwnerKey = useUsersOwnerKey();
  const usersById = useUsersById();
  const projection = useMemo(
    () =>
      selectEncryptedChatInfo({
        ownerKey,
        projectId: runtime?.projectId ?? null,
        streamUuid,
        catalogOwnerKey,
        messagesOwnerKey,
        usersOwnerKey,
        streamsById,
        bindingsById,
        messagesById,
        usersById,
      }),
    [
      ownerKey,
      runtime?.projectId,
      streamUuid,
      catalogOwnerKey,
      messagesOwnerKey,
      usersOwnerKey,
      streamsById,
      bindingsById,
      messagesById,
      usersById,
    ],
  );
  const selectedKeyUuid =
    projection?.stream.encryption === true
      ? projection.stream.currentEncryptionKey?.keyUuid
      : sendingKeyUuid;
  const scopeKey = `${ownerKey}:${runtime?.runtimeGeneration}:${streamUuid}:${selectedKeyUuid}`;
  const activeScopeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    activeScopeRef.current = scopeKey;
    return () => {
      activeScopeRef.current = null;
    };
  }, [scopeKey]);
  const onCopyKey = useCallback(() => {
    const current = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
    const catalog = readActiveChats();
    if (
      current == null ||
      ownerKey == null ||
      workspaceRuntimeOwnerKey(current) !== ownerKey ||
      current.runtimeGeneration !== runtime?.runtimeGeneration ||
      catalog.ownerKey !== ownerKey
    )
      return;
    const stream = catalog.streamsById[streamUuid];
    if (
      stream?.projectId !== current.projectId ||
      (stream.encryption !== true && stream.sourceName !== "native")
    )
      return;
    const keyUuid =
      stream.encryption === true ? stream.currentEncryptionKey?.keyUuid : sendingKeyUuid;
    if (keyUuid == null) return;
    void writeText(keyUuid).then((copied) => {
      const latest = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      if (
        activeScopeRef.current !== scopeKey ||
        latest == null ||
        workspaceRuntimeOwnerKey(latest) !== ownerKey ||
        latest.runtimeGeneration !== current.runtimeGeneration ||
        readActiveChats().ownerKey !== ownerKey ||
        (stream.encryption === true &&
          readActiveChats().streamsById[streamUuid]?.currentEncryptionKey?.keyUuid !== keyUuid)
      )
        return;
      if (!copied) toast.error(t("e2ee.copyFailed"));
    });
  }, [ownerKey, runtime?.runtimeGeneration, scopeKey, streamUuid, sendingKeyUuid]);
  return {
    projection,
    runtime,
    onCopyKey,
  };
}
