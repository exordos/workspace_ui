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
import { acceptMessageUpdate } from "./messages-accept-update.lib";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import { buildMessengerRequestOptions } from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerPollPayload, MessengerStream } from "./messenger.types";

export function supportsMessengerPolls(
  stream: Pick<MessengerStream, "sourceName" | "encryption" | "isArchived"> | undefined,
): boolean {
  return (
    (stream?.sourceName === "native" || stream?.sourceName === "zulip") &&
    stream.encryption !== true &&
    !stream.isArchived
  );
}

export function supportsMessengerPollManagement(
  stream: Pick<MessengerStream, "sourceName" | "encryption" | "isArchived"> | undefined,
  payload: MessengerPollPayload,
): boolean {
  if (!supportsMessengerPolls(stream)) return false;
  if (stream?.sourceName === "native") return true;
  const question = payload.questions[0];
  if (
    payload.questions.length !== 1 ||
    !question ||
    !payload.multipleAnswers ||
    payload.isAnonymous ||
    !payload.allowRevote ||
    payload.resultsVisibility !== "always" ||
    !payload.allowAddingOptions ||
    payload.closesAt != null ||
    payload.closedAt != null ||
    question.correctOptionUuids.length > 0
  )
    return true;
  const labels = question.options.map((option) => option.text);
  // Match the bridge's literal-line rules, including Python strip whitespace.
  const compatible =
    new Set(labels).size === labels.length &&
    [question.text, ...labels].every(
      (text) =>
        ![text.at(0), text.at(-1)].some(
          (edge) =>
            edge !== undefined &&
            (/\p{White_Space}/u.test(edge) ||
              (edge.charCodeAt(0) >= 28 && edge.charCodeAt(0) <= 31)),
        ) && !/\n|\r|@\*/.test(text),
    );
  return !compatible;
}

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
  const initial = useWorkspaceMessageStore.getState();
  const original = initial.messagesById[messageUuid];
  if (original?.payload.kind !== "poll") throw new Error("A loaded poll is required");
  const placementRevision = initial.messagePlacementRevisionById[messageUuid];
  const isCurrent = () => {
    const state = useWorkspaceMessageStore.getState();
    const message = state.messagesById[messageUuid];
    return (
      !stale() &&
      state.messagePlacementRevisionById[messageUuid] === placementRevision &&
      state.deletedMessageRevisionById[messageUuid] == null &&
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
  if (!isCurrent()) return { status: "skipped" as const };
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
  const accepted = acceptMessageUpdate({
    source: "poll-response",
    ownerKey: owner,
    message: adaptMessengerMessage(dto),
    store: useWorkspaceMessageStore,
    isCurrent,
    project: (message, messagesById) =>
      useMessengerStore.getState().applyMessagePointer(owner, message, messagesById),
    patchCache: messengerMessageActionCache.patchCachedMessage,
  });
  if (accepted.status === "stale-owner") return { status: "skipped" as const };
  if (accepted.cacheWrite != null) await accepted.cacheWrite;
  return isCurrent()
    ? {
        status: "applied" as const,
        message: useWorkspaceMessageStore.getState().messagesById[messageUuid],
      }
    : { status: "skipped" as const };
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
