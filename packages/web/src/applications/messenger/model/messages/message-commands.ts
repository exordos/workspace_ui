import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { getMessagesByUuids } from "~/shared/api/messenger-client";
import { buildMessengerRequestOptions } from "../messenger-request-options.lib";
import { useWorkspaceMessageStore } from "./message.model";
import {
  deleteMessengerMessage,
  editMessengerMessage,
  sendMessengerMessage,
} from "./messenger-message-actions.lib";
import { adaptMessengerMessage } from "./messenger-message-adapter.lib";
import { toggleMessengerMessageReaction } from "./messenger-message-reactions-actions.lib";
import { getMessengerReadQueue } from "./messenger-read-queue.lib";
import type { MessengerUuid } from "../messenger.types";

const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

type MessageRequestField = "runtimeContext" | "signal";
type MessageEditIntent = Pick<
  Extract<Parameters<typeof editMessengerMessage>[0], { markdown: string }>,
  MessageRequestField | "messageUuid" | "markdown" | "sourceMessage" | "isCurrent"
>;
type MessageSendBody =
  | { markdown: string; pollPayload?: never }
  | {
      markdown?: never;
      pollPayload: NonNullable<Parameters<typeof sendMessengerMessage>[0]["pollPayload"]>;
    };
type MessageSendIntent = Pick<
  Parameters<typeof sendMessengerMessage>[0],
  | MessageRequestField
  | "streamUuid"
  | "topicUuid"
  | "canonicalMessageUuid"
  | "includeStreamConversation"
> &
  MessageSendBody;

// Публичные действия сообщения. Исполнение и запись остаются в текущих операциях владельца.
export const messageCommands = {
  edit: ({
    runtimeContext,
    signal,
    messageUuid,
    markdown,
    sourceMessage,
    isCurrent,
  }: MessageEditIntent) =>
    editMessengerMessage({
      runtimeContext,
      signal,
      messageUuid,
      markdown,
      sourceMessage,
      isCurrent,
      getRuntimeContext: getRuntime,
    }),
  delete: ({
    runtimeContext,
    signal,
    messageUuid,
    streamUuid,
    topicUuid,
  }: Pick<
    Parameters<typeof deleteMessengerMessage>[0],
    MessageRequestField | "messageUuid" | "streamUuid" | "topicUuid"
  >) =>
    deleteMessengerMessage({
      runtimeContext,
      signal,
      messageUuid,
      streamUuid,
      topicUuid,
      getRuntimeContext: getRuntime,
    }),
  toggleReaction: ({
    runtimeContext,
    signal,
    messageUuid,
    emojiName,
  }: Pick<
    Parameters<typeof toggleMessengerMessageReaction>[0],
    MessageRequestField | "messageUuid" | "emojiName"
  >) =>
    toggleMessengerMessageReaction({
      runtimeContext,
      signal,
      messageUuid,
      emojiName,
      getRuntimeContext: getRuntime,
    }),
  send: (options: MessageSendIntent) => {
    const {
      runtimeContext,
      signal,
      streamUuid,
      topicUuid,
      canonicalMessageUuid,
      includeStreamConversation,
    } = options;
    const body: MessageSendBody =
      options.pollPayload == null
        ? { markdown: options.markdown }
        : { pollPayload: options.pollPayload };
    return sendMessengerMessage({
      runtimeContext,
      signal,
      streamUuid,
      topicUuid,
      canonicalMessageUuid,
      includeStreamConversation,
      ...body,
      getRuntimeContext: getRuntime,
    });
  },
};

// Лента ставит границы в очередь и наблюдает их статус. Жизненным циклом управляет владелец.
export function getMessageReadRequests(runtime: WorkspaceRuntimeContext) {
  const queue = getMessengerReadQueue(runtime);
  if (queue == null) return null;
  const { enqueue, getSnapshot, subscribe } = queue;
  return { enqueue, getSnapshot, subscribe };
}

// Подгружает известные по UUID тела, сохраняя edit/delete fence у хранилища сообщений.
export async function loadKnownMessages(
  runtime: WorkspaceRuntimeContext,
  messageUuids: readonly MessengerUuid[],
  signal: AbortSignal,
) {
  const ownerKey = workspaceRuntimeOwnerKey(runtime);
  const isCurrent = () =>
    !signal.aborted &&
    isWorkspaceRuntimeRequestContextCurrent(runtime, getRuntime) &&
    useWorkspaceMessageStore.getState().ownerKey === ownerKey;
  if (!isCurrent()) return;
  const { messageMutationRevision } = useWorkspaceMessageStore.getState();
  const dtos = await getMessagesByUuids(
    buildMessengerRequestOptions(runtime, undefined, signal),
    messageUuids,
  );
  for (const dto of dtos) {
    if (!isCurrent()) return;
    if (dto.project_id !== runtime.projectId || dto.user_uuid !== runtime.userUuid) continue;
    useWorkspaceMessageStore
      .getState()
      .upsertMessageBodyFromSnapshot(adaptMessengerMessage(dto), messageMutationRevision);
  }
}
