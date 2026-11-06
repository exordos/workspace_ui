import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useUsersStore } from "~/entities/user/user.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
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
  const catalogOwnerKey = useMessengerStore((state) => state.ownerKey);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const bindingsById = useMessengerStore((state) => state.streamBindingsById);
  const messagesOwnerKey = useWorkspaceMessageStore((state) => state.ownerKey);
  const messagesById = useWorkspaceMessageStore((state) => state.messagesById);
  const usersOwnerKey = useUsersStore((state) => state.ownerKey);
  const usersById = useUsersStore((state) => state.usersById);
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
    const catalog = useMessengerStore.getState();
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
        useMessengerStore.getState().ownerKey !== ownerKey ||
        (stream.encryption === true &&
          useMessengerStore.getState().streamsById[streamUuid]?.currentEncryptionKey?.keyUuid !==
            keyUuid)
      )
        return;
      if (!copied) toast.error(t("e2ee.copyFailed"));
    });
  }, [ownerKey, runtime?.runtimeGeneration, scopeKey, streamUuid, sendingKeyUuid]);
  return {
    projection,
    onCopyKey,
  };
}
