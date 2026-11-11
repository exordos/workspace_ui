import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { getPollVoters, invokePollAction } from "~/shared/api/messenger-messages.api";
import type { MessengerPollAction } from "~/shared/api/messenger-messages.api";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import { buildMessengerRequestOptions } from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";

interface PollOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  messageUuid: string;
  signal?: AbortSignal;
}

function isPollRequestStale(
  context: NonNullable<ReturnType<typeof captureWorkspaceRuntimeRequestContext>>,
  options: PollOptions,
): boolean {
  return (
    isWorkspaceRuntimeRequestInvalidated(
      context,
      options.getRuntimeContext ??
        (() => useWorkspaceAuthStore.getState().getCurrentRuntimeContext()),
      options.signal,
    ) || useWorkspaceMessageStore.getState().ownerKey !== workspaceRuntimeOwnerKey(context)
  );
}

export async function mutateMessengerPoll(options: PollOptions & { action: MessengerPollAction }) {
  const { runtimeContext, messageUuid, action, signal } = options;
  const context = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (context == null) return { status: "skipped" as const };
  const owner = workspaceRuntimeOwnerKey(context);
  const stale = () => isPollRequestStale(context, options);
  if (stale()) return { status: "skipped" as const };
  const original = useWorkspaceMessageStore.getState().messagesById[messageUuid];
  if (original?.payload.kind !== "poll") throw new Error("A loaded poll is required");
  const currentMessage = () => {
    const message = useWorkspaceMessageStore.getState().messagesById[messageUuid];
    return (
      !stale() &&
      message?.streamUuid === original.streamUuid &&
      message.topicUuid === original.topicUuid &&
      message.payload.kind === "poll"
    );
  };
  const dto = await invokePollAction(
    buildMessengerRequestOptions(runtimeContext, undefined, signal),
    messageUuid,
    action,
  );
  if (!currentMessage()) return { status: "skipped" as const };
  if (
    dto.uuid !== messageUuid ||
    dto.project_id !== runtimeContext.projectId ||
    dto.user_uuid !== runtimeContext.userUuid ||
    dto.author_uuid !== original.authorUuid ||
    dto.stream_uuid !== original.streamUuid ||
    dto.topic_uuid !== original.topicUuid ||
    dto.payload.kind !== "poll" ||
    dto.poll_state == null
  )
    throw new Error("invalid-message");
  // The revision merge chooses the poll snapshot independently of reaction/read fields.
  useWorkspaceMessageStore.getState().applyLiveKnownBodyMutation(adaptMessengerMessage(dto));
  const message = useWorkspaceMessageStore.getState().messagesById[messageUuid];
  if (message && !stale()) {
    useMessengerStore
      .getState()
      .applyMessagePointer(owner, message, useWorkspaceMessageStore.getState().messagesById);
    try {
      await messengerMessageActionCache.patchCachedMessage?.(owner, message, currentMessage);
    } catch {
      /* Cache is best effort. */
    }
  }
  return { status: "applied" as const, message };
}

export async function getMessengerPollVoters(
  options: PollOptions & {
    questionUuid: string;
    optionUuid: string;
    pageMarker?: string;
    pageLimit?: number;
  },
) {
  const { runtimeContext, signal, messageUuid, questionUuid, optionUuid, pageMarker, pageLimit } =
    options;
  const context = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (context == null) throw new Error("missing-context");
  const stale = () => isPollRequestStale(context, options);
  if (stale()) throw new Error("stale-owner");
  const result = await getPollVoters(
    buildMessengerRequestOptions(runtimeContext, undefined, signal),
    messageUuid,
    { questionUuid, optionUuid, pageMarker, pageLimit },
  );
  if (stale()) throw new Error("stale-owner");
  return result;
}
