import { useWorkspaceMessageStore } from "~/entities/message/message.model";
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
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { conversationIdForStream, conversationIdForTopic } from "./messenger-ids.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import {
  applyDeletedMessagePointerRepair,
  useMessengerStore,
  type MessengerDeletedMessagePointerTargets,
} from "./messenger.model";
import type { MessengerMessagePointerCacheTargets } from "./messenger-cache.lib";
import type { MessengerDeletedMessage, MessengerMessage, MessengerUuid } from "./messenger.types";

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
  patchCachedMessage?: (ownerKey: string, message: MessengerMessage) => Promise<void> | void;
  repairMessagePointers?: (
    ownerKey: string,
    message: MessengerMessage,
    targets: MessengerMessagePointerCacheTargets,
  ) => Promise<void> | void;
}

export interface RepairDeletedMessagePointersOptions {
  runtimeContext: WorkspaceRuntimeContext;
  plan: DeletedMessagePointerRepairPlan;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: DeletedMessagePointerRepairClientDeps;
  cache?: DeletedMessagePointerRepairCacheDeps;
  signal?: AbortSignal;
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
  const messages = Object.values(useWorkspaceMessageStore.getState().messagesById).filter(
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
    writes.map(async ({ message, targets }) => {
      try {
        if (cache.repairMessagePointers != null) {
          await cache.repairMessagePointers(ownerKey, message, targets);
        } else {
          await cache.patchCachedMessage?.(ownerKey, message);
        }
      } catch {
        // A cache failure must not turn a successful delete into a failed action.
      }
    }),
  );
}

export function captureDeletedMessagePointerRepair(
  ownerKey: string,
  message: MessengerDeletedMessage,
): DeletedMessagePointerRepairPlan {
  const state = useMessengerStore.getState();
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

export async function repairDeletedMessagePointers({
  runtimeContext,
  plan,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache,
  signal,
}: RepairDeletedMessagePointersOptions): Promise<void> {
  if (!hasPointerTargets(plan.targets)) return;
  const knownReplacements = collectKnownReplacementMessages(plan);
  const capturedMutationRevision = useWorkspaceMessageStore.getState().messageMutationRevision;

  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null || workspaceRuntimeOwnerKey(requestContext) !== plan.ownerKey) return;
  const isStale = (): boolean =>
    isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
  if (isStale()) return;

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
  if (isStale()) return;
  const replacements = collectSettledReplacementMessages(
    requests,
    settledPages,
    knownReplacements,
    plan.message.uuid,
  );

  const effectiveReplacements: Partial<Record<"stream" | "topic", MessengerMessage>> = {};
  for (const scope of ["stream", "topic"] as const) {
    const message = replacements[scope];
    if (message == null) continue;
    const messageStore = useWorkspaceMessageStore.getState();
    messageStore.upsertMessageBodyFromSnapshot(message, capturedMutationRevision);
    const effectiveMessage = useWorkspaceMessageStore.getState().messagesById[message.uuid];
    if (effectiveMessage != null) effectiveReplacements[scope] = effectiveMessage;
  }
  applyDeletedMessagePointerRepair(plan.ownerKey, plan.message, plan.targets, {
    stream: effectiveReplacements.stream ?? null,
    topic: effectiveReplacements.topic ?? null,
  });
  await writeRepairCacheBestEffort(cache, plan.ownerKey, plan, effectiveReplacements);
}
