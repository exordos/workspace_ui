import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { setStreamTopicSummaryConfiguration as defaultSetStreamTopicSummaryConfiguration } from "~/shared/api/messenger-topics.api";
import type {
  WorkspaceMessengerTopicDto,
  WorkspaceMessengerTopicSummaryConfigurationRequestBody,
} from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { adaptMessengerTopic } from "./messenger-adapters.lib";
import { upsertMessengerTopicCache as defaultUpsertMessengerTopicCache } from "./messenger-cache.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerTopic, MessengerUuid } from "./messenger.types";

const log = createLogger("messenger-topic-summary-actions");

export interface MessengerTopicSummaryActionClientDeps {
  setStreamTopicSummaryConfiguration?: (
    options: MessengerClientOptions,
    topicUuid: MessengerUuid,
    body: WorkspaceMessengerTopicSummaryConfigurationRequestBody,
  ) => Promise<WorkspaceMessengerTopicDto>;
}

export interface MessengerTopicSummaryActionCacheDeps {
  upsertCachedTopic?: (ownerKey: string, topic: MessengerTopic) => Promise<void> | void;
}

export interface MessengerTopicSummaryActionStoreApi {
  getState: () => Pick<MessengerStoreState, "ownerKey" | "topicsById" | "upsertTopic">;
}

export interface UpdateMessengerTopicSummaryConfigurationOptions {
  runtimeContext: WorkspaceRuntimeContext;
  topicUuid: MessengerUuid;
  body: WorkspaceMessengerTopicSummaryConfigurationRequestBody;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  signal?: AbortSignal;
  client?: MessengerTopicSummaryActionClientDeps;
  cache?: MessengerTopicSummaryActionCacheDeps;
  store?: MessengerTopicSummaryActionStoreApi;
}

export type UpdateMessengerTopicSummaryConfigurationResult =
  | {
      status: "applied";
      ownerKey: string;
      topic: MessengerTopic;
      source: "response" | "current";
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "superseded";
    };

function compareIsoTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return left.localeCompare(right);
}

function selectEffectiveTopic(
  topicAtRequestStart: MessengerTopic | undefined,
  currentTopic: MessengerTopic | undefined,
  responseTopic: MessengerTopic,
): { topic: MessengerTopic; source: "response" | "current" } | null {
  if (currentTopic == null && topicAtRequestStart != null) {
    // A realtime delete while the request was in flight must not be undone.
    return null;
  }

  if (
    currentTopic != null &&
    currentTopic !== topicAtRequestStart &&
    compareIsoTimestamps(currentTopic.updatedAt, responseTopic.updatedAt) >= 0
  ) {
    return { topic: currentTopic, source: "current" };
  }

  return { topic: responseTopic, source: "response" };
}

async function persistTopicBestEffort(
  ownerKey: string,
  topic: MessengerTopic,
  upsertCachedTopic: NonNullable<MessengerTopicSummaryActionCacheDeps["upsertCachedTopic"]>,
): Promise<void> {
  try {
    await upsertCachedTopic(ownerKey, topic);
  } catch (error) {
    // Prompt text is deliberately excluded from logs.
    log.warn("Could not persist topic summary configuration", {
      topicUuid: topic.uuid,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

function currentRuntimeContext(): WorkspaceRuntimeContext | null {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}

export async function updateMessengerTopicSummaryConfiguration({
  runtimeContext,
  topicUuid,
  body,
  getRuntimeContext = currentRuntimeContext,
  clientOptions,
  signal,
  client = {},
  cache = {},
  store = useMessengerStore,
}: UpdateMessengerTopicSummaryConfigurationOptions): Promise<UpdateMessengerTopicSummaryConfigurationResult> {
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  }

  const ownerKey = workspaceRuntimeOwnerKey(requestContext);
  const isStale = (): boolean =>
    isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal);
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const topicAtRequestStart = store.getState().topicsById[topicUuid];
  const dto = await (
    client.setStreamTopicSummaryConfiguration ?? defaultSetStreamTopicSummaryConfiguration
  )(buildMessengerRequestOptions(runtimeContext, clientOptions, signal), topicUuid, body);
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const responseTopic = adaptMessengerTopic(dto);
  const stateAfterRequest = store.getState();
  if (stateAfterRequest.ownerKey !== ownerKey) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const selected = selectEffectiveTopic(
    topicAtRequestStart,
    stateAfterRequest.topicsById[topicUuid],
    responseTopic,
  );
  if (selected == null) {
    return { status: "skipped", ownerKey, reason: "superseded" };
  }

  if (selected.source === "response") {
    stateAfterRequest.upsertTopic(ownerKey, selected.topic);
  }
  const effectiveTopic = store.getState().topicsById[topicUuid];
  if (effectiveTopic == null) {
    return { status: "skipped", ownerKey, reason: "superseded" };
  }
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  await persistTopicBestEffort(
    ownerKey,
    effectiveTopic,
    cache.upsertCachedTopic ?? defaultUpsertMessengerTopicCache,
  );
  if (isStale()) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }

  const stateAfterCache = store.getState();
  if (stateAfterCache.ownerKey !== ownerKey) {
    return { status: "skipped", ownerKey, reason: "stale-owner" };
  }
  const topicAfterCache = stateAfterCache.topicsById[topicUuid];
  if (topicAfterCache == null) {
    return { status: "skipped", ownerKey, reason: "superseded" };
  }

  return {
    status: "applied",
    ownerKey,
    topic: topicAfterCache,
    source: topicAfterCache === effectiveTopic ? selected.source : "current",
  };
}
