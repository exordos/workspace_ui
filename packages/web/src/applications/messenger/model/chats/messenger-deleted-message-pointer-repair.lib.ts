import {
  getSelectedWorkspaceMessageStore,
  getWorkspaceMessageStoreForOwner,
} from "~/applications/messenger/model/messages/message.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  getMessagesPage as defaultGetMessagesPage,
  type MessengerClientOptions,
  type MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { isLaterMessageTimestamp } from "~/shared/lib/workspace-messenger-message-time";
import { adaptMessengerMessage } from "../messages/messenger-message-adapter.lib";
import {
  messengerRealtimeCache,
  type MessengerMessagePointerCacheRepair,
  type MessengerMessagePointerCacheTargets,
} from "../messenger-cache.lib";
import { conversationIdForStream, conversationIdForTopic } from "../messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "../messenger-request-options.lib";
import {
  applyDeletedMessagePointerRepair,
  getMessengerStoreForOwner,
  getSelectedMessengerStore,
  type MessengerDeletedMessagePointerTargets,
} from "./messenger.model";
import type { KnownMessageCacheWriter } from "../messages/messages-accept-update.lib";
import type { MessengerDeletedMessage, MessengerMessage, MessengerUuid } from "../messenger.types";

export interface DeletedMessagePointerRepairPlan {
  ownerKey: string;
  message: MessengerDeletedMessage;
  targets: MessengerDeletedMessagePointerTargets;
}

interface DeletedMessagePointerRepairClientDeps {
  getMessagesPage?: (
    options: MessengerClientOptions,
    query: {
      streamUuid: MessengerUuid;
      topicUuid?: MessengerUuid;
      pageLimit: number;
      sortKey: "created_at";
      sortDir: "desc";
    },
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
}

interface DeletedMessagePointerRepairCacheDeps {
  patchCachedMessage?: KnownMessageCacheWriter;
  repairMessagePointers?: MessengerMessagePointerCacheRepair;
}

export interface RepairDeletedMessagePointersOptions {
  runtimeContext: WorkspaceRuntimeContext;
  plan: DeletedMessagePointerRepairPlan;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: DeletedMessagePointerRepairClientDeps;
  cache?: DeletedMessagePointerRepairCacheDeps;
  signal?: AbortSignal;
  isCurrent?: () => boolean; // Optional guard from the accepted deletion.
}

type DeletedMessagePointerScope = "stream" | "topic";

interface DeletedMessagePointerRequest {
  scope: DeletedMessagePointerScope;
  promise: Promise<MessengerCollectionPage<WorkspaceMessengerMessageDto>>;
}

function hasPointerTargets(targets: MessengerDeletedMessagePointerTargets): boolean {
  return targets.stream || targets.topic || targets.streamConversation || targets.topicConversation;
}

function compareMessages(left: MessengerMessage, right: MessengerMessage): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  return createdAtOrder !== 0 ? createdAtOrder : left.uuid.localeCompare(right.uuid);
}

function latestKnownMessage(
  messages: readonly MessengerMessage[],
  predicate: (message: MessengerMessage) => boolean,
): MessengerMessage | null {
  let latest: MessengerMessage | null = null;
  for (const message of messages) {
    if (!predicate(message)) continue;
    if (latest == null || compareMessages(latest, message) < 0) {
      latest = message;
    }
  }
  return latest;
}

function collectKnownReplacementMessages(plan: DeletedMessagePointerRepairPlan): {
  stream: MessengerMessage | null;
  topic: MessengerMessage | null;
} {
  const messagesStore =
    getWorkspaceMessageStoreForOwner(plan.ownerKey) ?? getSelectedWorkspaceMessageStore();
  const messages = Object.values(messagesStore.getState().messagesById).filter(
    (message) => message.uuid !== plan.message.uuid,
  );
  return {
    topic:
      plan.targets.topic || plan.targets.topicConversation
        ? latestKnownMessage(
            messages,
            (message) =>
              message.streamUuid === plan.message.streamUuid &&
              message.topicUuid === plan.message.topicUuid,
          )
        : null,
    stream:
      plan.targets.stream || plan.targets.streamConversation
        ? latestKnownMessage(messages, (message) => message.streamUuid === plan.message.streamUuid)
        : null,
  };
}

function collectSettledReplacementMessages(
  requests: readonly DeletedMessagePointerRequest[],
  settledPages: readonly PromiseSettledResult<
    MessengerCollectionPage<WorkspaceMessengerMessageDto>
  >[],
  knownReplacements: Record<DeletedMessagePointerScope, MessengerMessage | null>,
  deletedMessageUuid: MessengerUuid,
): Partial<Record<DeletedMessagePointerScope, MessengerMessage>> {
  const replacements: Partial<Record<DeletedMessagePointerScope, MessengerMessage>> = {};
  for (const [index, result] of settledPages.entries()) {
    const scope = requests[index]?.scope;
    if (scope == null) continue;
    if (result.status === "rejected") {
      const known = knownReplacements[scope];
      if (known != null) replacements[scope] = known;
      continue;
    }
    const dto = result.value.items.find((message) => message.uuid !== deletedMessageUuid);
    if (dto != null) replacements[scope] = adaptMessengerMessage(dto);
  }
  return replacements;
}

async function writeRepairCacheBestEffort(
  cache: DeletedMessagePointerRepairCacheDeps | undefined,
  ownerKey: string,
  plan: DeletedMessagePointerRepairPlan,
  replacements: Partial<Record<DeletedMessagePointerScope, MessengerMessage>>,
  isCurrent: () => boolean,
  catalog: ReturnType<typeof getSelectedMessengerStore>,
  messagesStore: ReturnType<typeof getSelectedWorkspaceMessageStore>,
): Promise<void> {
  if (cache == null) return;
  const writes: { message: MessengerMessage; targets: MessengerMessagePointerCacheTargets }[] = [];
  if (replacements.stream != null) {
    writes.push({
      message: replacements.stream,
      targets: {
        stream: plan.targets.stream,
        conversationIds: plan.targets.streamConversation
          ? [conversationIdForStream(plan.message.streamUuid)]
          : [],
      },
    });
  }
  if (replacements.topic != null) {
    writes.push({
      message: replacements.topic,
      targets: {
        topic: plan.targets.topic,
        conversationIds: plan.targets.topicConversation
          ? [conversationIdForTopic(plan.message.streamUuid, plan.message.topicUuid)]
          : [],
      },
    });
  }

  await Promise.all(
    writes.map(async ({ message, targets: requested }) => {
      const currentBody = () => {
        if (!isCurrent()) return;
        const messages = messagesStore.getState();
        const latest = messages.messagesById[message.uuid];
        return messages.deletedMessageRevisionById[message.uuid] == null &&
          latest?.conversationId === message.conversationId &&
          latest.updatedAt === message.updatedAt &&
          latest.payload === message.payload &&
          latest.pollState === message.pollState &&
          latest.pinned === message.pinned &&
          latest.starred === message.starred
          ? latest
          : undefined;
      };
      try {
        let latest = currentBody();
        while (latest != null) {
          const targets = currentRepairTargets(catalog.getState(), message, requested);
          if (!targets.stream && !targets.topic && !targets.conversationIds?.length) return;

          const { read } = latest;
          const isWriteCurrent = () => currentBody()?.read === read;
          // A read-only update can invalidate the transaction without superseding this body.
          const snapshot = message.read === read ? message : { ...message, read };
          if (cache.repairMessagePointers != null) {
            await cache.repairMessagePointers(ownerKey, snapshot, targets, {
              isWriteCurrent,
              replacingDeletedUuid: plan.message.uuid,
            });
          } else {
            await cache.patchCachedMessage?.(ownerKey, snapshot, isWriteCurrent);
          }
          latest = currentBody();
          if (latest?.read === read) return;
        }
      } catch {
        // A cache failure must not turn a successful delete into a failed action.
      }
    }),
  );
}

// Recheck each target on a retry so a newer live pointer stays in place.
function currentRepairTargets(
  state: ReturnType<ReturnType<typeof getSelectedMessengerStore>["getState"]>,
  message: MessengerMessage,
  requested: MessengerMessagePointerCacheTargets,
): MessengerMessagePointerCacheTargets {
  return {
    ...(requested.stream == null
      ? {}
      : {
          stream:
            requested.stream &&
            state.streamsById[message.streamUuid]?.lastMessageUuid === message.uuid,
        }),
    ...(requested.topic == null
      ? {}
      : {
          topic:
            requested.topic &&
            state.topicsById[message.topicUuid]?.lastMessageUuid === message.uuid,
        }),
    conversationIds: requested.conversationIds?.filter(
      (id) => state.conversationsById[id]?.lastMessageUuid === message.uuid,
    ),
  };
}

export function captureDeletedMessagePointerRepair(
  ownerKey: string,
  message: MessengerDeletedMessage,
): DeletedMessagePointerRepairPlan {
  const state = (getMessengerStoreForOwner(ownerKey) ?? getSelectedMessengerStore()).getState();
  const streamConversationId = conversationIdForStream(message.streamUuid);
  const topicConversationId = conversationIdForTopic(message.streamUuid, message.topicUuid);
  return {
    ownerKey,
    message,
    targets: {
      stream:
        state.ownerKey === ownerKey &&
        state.streamsById[message.streamUuid]?.lastMessageUuid === message.uuid,
      topic:
        state.ownerKey === ownerKey &&
        state.topicsById[message.topicUuid]?.lastMessageUuid === message.uuid,
      streamConversation:
        state.ownerKey === ownerKey &&
        state.conversationsById[streamConversationId]?.lastMessageUuid === message.uuid,
      topicConversation:
        state.ownerKey === ownerKey &&
        state.conversationsById[topicConversationId]?.lastMessageUuid === message.uuid,
    },
  };
}

// Reconcile the remaining owner pointers in memory and the local snapshot.
export async function repairDeletedMessagePointers({
  runtimeContext,
  plan,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = messengerRealtimeCache,
  signal,
  isCurrent = () => true,
}: RepairDeletedMessagePointersOptions): Promise<void> {
  if (!hasPointerTargets(plan.targets)) return;
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null || workspaceRuntimeOwnerKey(requestContext) !== plan.ownerKey) return;
  const catalog = getMessengerStoreForOwner(plan.ownerKey) ?? getSelectedMessengerStore();
  const messagesStore =
    getWorkspaceMessageStoreForOwner(plan.ownerKey) ?? getSelectedWorkspaceMessageStore();
  const initialStore = messagesStore.getState();
  const canWrite = () =>
    isCurrent() &&
    !isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal) &&
    catalog.getState().ownerKey === plan.ownerKey &&
    messagesStore.getState().ownerKey === initialStore.ownerKey;
  if ((initialStore.ownerKey != null && initialStore.ownerKey !== plan.ownerKey) || !canWrite())
    return;
  const knownReplacements = collectKnownReplacementMessages(plan);
  const capturedMutationRevision = initialStore.messageMutationRevision;

  const getMessagesPage = client.getMessagesPage ?? defaultGetMessagesPage;
  const requests: DeletedMessagePointerRequest[] = [];
  if (plan.targets.topic || plan.targets.topicConversation) {
    requests.push({
      scope: "topic",
      promise: getMessagesPage(
        buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
        {
          streamUuid: plan.message.streamUuid,
          topicUuid: plan.message.topicUuid,
          pageLimit: 1,
          sortKey: "created_at",
          sortDir: "desc",
        },
      ),
    });
  }
  if (plan.targets.stream || plan.targets.streamConversation) {
    requests.push({
      scope: "stream",
      promise: getMessagesPage(
        buildMessengerRequestOptions(runtimeContext, clientOptions, signal),
        {
          streamUuid: plan.message.streamUuid,
          pageLimit: 1,
          sortKey: "created_at",
          sortDir: "desc",
        },
      ),
    });
  }

  const settledPages = await Promise.allSettled(requests.map((request) => request.promise));
  if (!canWrite()) return;
  const replacements = collectSettledReplacementMessages(
    requests,
    settledPages,
    knownReplacements,
    plan.message.uuid,
  );

  for (const scope of ["stream", "topic"] as const) {
    if (!canWrite()) return;
    const message = replacements[scope];
    if (
      message?.streamUuid !== plan.message.streamUuid ||
      (scope === "topic" && message.topicUuid !== plan.message.topicUuid)
    )
      continue;
    const messageStore = messagesStore.getState();
    if (messageStore.deletedMessageRevisionById[message.uuid] != null) continue;
    const known = messageStore.messagesById[message.uuid];
    if (known == null || !isLaterMessageTimestamp(known.updatedAt, message.updatedAt))
      messageStore.upsertMessageBodyFromSnapshot(message, capturedMutationRevision);
  }
  if (!canWrite()) return;
  // Both requests can supply the same UUID, or a subscriber may delete it during publication.
  const updatedStore = messagesStore.getState();
  const effective = (scope: DeletedMessagePointerScope) => {
    const uuid = replacements[scope]?.uuid;
    if (uuid == null || updatedStore.deletedMessageRevisionById[uuid] != null) return undefined;
    const message = updatedStore.messagesById[uuid];
    return message?.streamUuid === plan.message.streamUuid &&
      (scope === "stream" || message.topicUuid === plan.message.topicUuid)
      ? message
      : undefined;
  };
  const effectiveReplacements = { stream: effective("stream"), topic: effective("topic") };
  applyDeletedMessagePointerRepair(plan.ownerKey, plan.message, plan.targets, {
    stream: effectiveReplacements.stream ?? null,
    topic: effectiveReplacements.topic ?? null,
  });
  await writeRepairCacheBestEffort(
    cache,
    plan.ownerKey,
    plan,
    effectiveReplacements,
    canWrite,
    catalog,
    messagesStore,
  );
}
