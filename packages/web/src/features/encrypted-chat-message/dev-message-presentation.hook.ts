import { useMemo } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { decodeDevChatMessageForPresentation } from "~/entities/messenger/chat-dev-crypto.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";

/** Plaintext lives only in presentation memory and never replaces the stored envelope. */
export function useDevMessagePresentation(message: MessengerMessage): string | null {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  const catalogOwner = useMessengerStore((state) => state.ownerKey);
  const messageOwner = useWorkspaceMessageStore((state) => state.ownerKey);
  const stream = useMessengerStore((state) => state.streamsById[message.streamUuid]);
  return useMemo(() => {
    if (runtime == null) return null;
    const owner = workspaceRuntimeOwnerKey(runtime);
    if (catalogOwner !== owner || messageOwner !== owner) return null;
    return decodeDevChatMessageForPresentation(runtime, stream, message);
  }, [runtime, catalogOwner, messageOwner, stream, message]);
}
