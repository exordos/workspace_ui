import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { getPollVoters, invokePollAction } from "~/shared/api/messenger-messages.api";
import type { MessengerPollAction } from "~/shared/api/messenger-messages.api";
import { useMessengerStore } from "../../chats/messenger.model";
import { messengerMessageActionCache } from "../../messenger-cache.lib";
import { buildMessengerRequestOptions } from "../../messenger-request-options.lib";
import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "../message.model";
import { acceptMessageUpdate } from "../messages-accept-update.lib";
import { adaptMessengerMessage } from "../messenger-message-adapter.lib";
import type { MessengerPollPayload, MessengerStream } from "../../messenger.types";

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
  store?: ReturnType<typeof getSelectedWorkspaceMessageStore>;
}

function isPollRequestStale(
  context: NonNullable<ReturnType<typeof captureWorkspaceRuntimeRequestContext>>,
  options: PollOptions,
  store: ReturnType<typeof getSelectedWorkspaceMessageStore>,
): boolean {
  return (
    isWorkspaceRuntimeRequestInvalidated(
      context,
      options.getRuntimeContext ??
        (() => useWorkspaceAuthStore.getState().getCurrentRuntimeContext()),
      options.signal,
    ) || store.getState().ownerKey !== workspaceRuntimeOwnerKey(context)
  );
}

export async function mutateMessengerPoll(options: PollOptions & { action: MessengerPollAction }) {
  const { runtimeContext, messageUuid, action, signal } = options;
  const context = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (context == null) return { status: "skipped" as const };
  const owner = workspaceRuntimeOwnerKey(context);
  const store =
    options.store ?? getWorkspaceMessageStoreForOwner(owner) ?? getSelectedWorkspaceMessageStore();
  const stale = () => isPollRequestStale(context, options, store);
  if (stale()) return { status: "skipped" as const };
  const initial = store.getState();
  const original = initial.messagesById[messageUuid];
  if (original?.payload.kind !== "poll") throw new Error("A loaded poll is required");
  const placementRevision = initial.messagePlacementRevisionById[messageUuid];
  const isCurrent = () => {
    const state = store.getState();
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
    store,
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
        message: store.getState().messagesById[messageUuid],
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
  const store =
    options.store ??
    getWorkspaceMessageStoreForOwner(workspaceRuntimeOwnerKey(context)) ??
    getSelectedWorkspaceMessageStore();
  const stale = () => isPollRequestStale(context, options, store);
  if (stale()) throw new Error("stale-owner");
  const result = await getPollVoters(
    buildMessengerRequestOptions(runtimeContext, undefined, signal),
    messageUuid,
    { questionUuid, optionUuid, pageMarker, pageLimit },
  );
  if (stale()) throw new Error("stale-owner");
  return result;
}
