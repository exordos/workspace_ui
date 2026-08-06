import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createMessageReaction as defaultCreateMessageReaction,
  deleteMessageReaction as defaultDeleteMessageReaction,
  getMessageReactions as defaultGetMessageReactions,
  MessengerApiError,
} from "~/shared/api/messenger-client";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import type {
  WorkspaceMessengerCreateMessageReactionRequestBody,
  WorkspaceMessengerMessageReactionDto,
} from "~/shared/api/messenger.types";
import {
  deleteMessengerOwnMessageReactionCache as defaultDeleteMessengerOwnMessageReactionCache,
  readMessengerOwnMessageReactionCache as defaultReadMessengerOwnMessageReactionCache,
  readMessengerOwnMessageReactionsCache as defaultReadMessengerOwnMessageReactionsCache,
  replaceMessengerOwnMessageReactionsForOwnerCache as defaultReplaceMessengerOwnMessageReactionsForOwnerCache,
  replaceMessengerOwnMessageReactionsForMessageCache as defaultReplaceMessengerOwnMessageReactionsForMessageCache,
  upsertMessengerOwnMessageReactionCache as defaultUpsertMessengerOwnMessageReactionCache,
} from "./messenger-cache.lib";
import {
  buildMessengerRequestOptions,
  type MessengerRequestOptionsOverrides,
} from "./messenger-request-options.lib";
import type {
  MessengerOwnMessageReactionCacheRow,
  MessengerOwnMessageReactionCacheWrite,
} from "./messenger-cache.lib";
import type {
  MessengerMessage,
  MessengerOwnReactionProjectionRow,
  MessengerUuid,
} from "./messenger.types";

export interface MessengerMessageReactionClientDeps {
  getMessageReactions?: (
    options: MessengerClientOptions,
    query: { messageUuid?: string; userUuid?: string },
  ) => Promise<WorkspaceMessengerMessageReactionDto[]>;
  createMessageReaction?: (
    options: MessengerClientOptions,
    body: WorkspaceMessengerCreateMessageReactionRequestBody,
  ) => Promise<WorkspaceMessengerMessageReactionDto>;
  deleteMessageReaction?: (options: MessengerClientOptions, reactionUuid: string) => Promise<void>;
}

export interface MessengerMessageReactionCacheDeps {
  readOwnMessageReactions?: (
    ownerKey: string,
    messageUuids: readonly MessengerUuid[],
  ) => Promise<MessengerOwnMessageReactionCacheRow[]>;
  readOwnMessageReaction?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    emojiName: string,
  ) => Promise<MessengerOwnMessageReactionCacheRow | null>;
  replaceOwnMessageReactionsForMessage?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    rows: readonly MessengerOwnMessageReactionCacheWrite[],
  ) => Promise<void> | void;
  replaceOwnMessageReactionsForOwner?: (
    ownerKey: string,
    rows: readonly MessengerOwnMessageReactionCacheWrite[],
  ) => Promise<void> | void;
  upsertOwnMessageReaction?: (
    ownerKey: string,
    row: MessengerOwnMessageReactionCacheWrite,
  ) => Promise<void> | void;
  deleteOwnMessageReaction?: (
    ownerKey: string,
    messageUuid: MessengerUuid,
    emojiName: string,
  ) => Promise<void> | void;
}

export interface MessengerMessageReactionStoreApi {
  getState: () => Pick<
    ReturnType<typeof useWorkspaceMessageStore.getState>,
    | "messagesById"
    | "applyOwnMessageReactions"
    | "setOwnMessageReaction"
    | "removeOwnMessageReaction"
    | "beginOptimisticOwnMessageReaction"
    | "settleOptimisticOwnMessageReaction"
    | "rollbackOptimisticOwnMessageReaction"
  >;
}

export interface MessengerMessageReactionBaseOptions {
  runtimeContext: WorkspaceRuntimeContext;
  getRuntimeContext?: WorkspaceRuntimeContextGetter;
  clientOptions?: MessengerRequestOptionsOverrides;
  client?: MessengerMessageReactionClientDeps;
  cache?: MessengerMessageReactionCacheDeps;
  signal?: AbortSignal;
  store?: MessengerMessageReactionStoreApi;
}

export interface MessengerVisibleOwnReactionsOptions extends MessengerMessageReactionBaseOptions {
  messageUuids: readonly MessengerUuid[];
}

export interface MessengerSingleReactionOptions extends MessengerMessageReactionBaseOptions {
  messageUuid: MessengerUuid;
  emojiName: string;
}

export type MessengerOwnReactionsSyncResult =
  | {
      status: "applied";
      ownerKey: string;
      messageUuids: MessengerUuid[];
      reactions: number;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "empty-message-list";
    };

export type MessengerMessageReactionActionResult =
  | {
      status: "applied";
      ownerKey: string;
      messageUuid: MessengerUuid;
      emojiName: string;
      operation: "added" | "removed" | "already-added";
      reactionUuid: MessengerUuid | null;
    }
  | {
      status: "skipped";
      ownerKey: string | null;
      reason: "missing-context" | "stale-owner" | "empty-emoji" | "pending-reaction";
    };

interface CapturedReactionAction {
  ownerKey: string;
  isStale: () => boolean;
}

type CapturedReactionActionResult =
  | CapturedReactionAction
  | { ownerKey: null; isStale: () => boolean };

const defaultReactionCache: Required<MessengerMessageReactionCacheDeps> = {
  readOwnMessageReactions: defaultReadMessengerOwnMessageReactionsCache,
  readOwnMessageReaction: defaultReadMessengerOwnMessageReactionCache,
  replaceOwnMessageReactionsForMessage: defaultReplaceMessengerOwnMessageReactionsForMessageCache,
  replaceOwnMessageReactionsForOwner: defaultReplaceMessengerOwnMessageReactionsForOwnerCache,
  upsertOwnMessageReaction: defaultUpsertMessengerOwnMessageReactionCache,
  deleteOwnMessageReaction: defaultDeleteMessengerOwnMessageReactionCache,
};

function captureReactionAction(
  runtimeContext: WorkspaceRuntimeContext,
  getRuntimeContext: WorkspaceRuntimeContextGetter,
  signal: AbortSignal | undefined,
): CapturedReactionActionResult {
  // Здесь фиксируется полный runtime owner вместе с generation. Это защищает
  // store и cache от поздних ответов старой организации, проекта или вкладки.
  const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
  if (requestContext == null) {
    return { ownerKey: null, isStale: () => true };
  }

  return {
    ownerKey: workspaceRuntimeOwnerKey(requestContext),
    isStale: () => isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, signal),
  };
}

function normalizedMessageUuids(messageUuids: readonly MessengerUuid[]): MessengerUuid[] {
  // Видимое окно может передать один и тот же messageUuid из stream/topic buckets,
  // поэтому action слой сам убирает дубли до чтения cache или SWR-запросов.
  const seen = new Set<MessengerUuid>();
  const normalized: MessengerUuid[] = [];
  for (const messageUuid of messageUuids) {
    const trimmed = messageUuid.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeEmojiName(emojiName: string): string | null {
  const trimmed = emojiName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ownReactionProjectionRows(
  rows: readonly { emojiName: string; reactionUuid: MessengerUuid }[],
): MessengerOwnReactionProjectionRow[] {
  return rows.map((row) => ({
    emojiName: row.emojiName,
    reactionUuid: row.reactionUuid,
  }));
}

function groupOwnReactionRowsByMessage<T extends { messageUuid: MessengerUuid }>(
  rows: readonly T[],
): Map<MessengerUuid, T[]> {
  const grouped = new Map<MessengerUuid, T[]>();
  for (const row of rows) {
    const messageRows = grouped.get(row.messageUuid);
    if (messageRows == null) {
      grouped.set(row.messageUuid, [row]);
    } else {
      messageRows.push(row);
    }
  }
  return grouped;
}

function dtoToOwnReactionCacheWrite(
  dto: WorkspaceMessengerMessageReactionDto,
): MessengerOwnMessageReactionCacheWrite {
  return {
    messageUuid: dto.message_uuid,
    userUuid: dto.user_uuid,
    reactionUuid: dto.uuid,
    emojiName: dto.emoji_name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function reactionDtoMatchesCurrentUser(
  dto: WorkspaceMessengerMessageReactionDto,
  runtimeContext: WorkspaceRuntimeContext,
): boolean {
  return dto.user_uuid === runtimeContext.userUuid;
}

function isDuplicateReactionConflict(error: unknown): boolean {
  return error instanceof MessengerApiError && error.status === 409;
}

function writeReactionCacheBestEffort(write: () => Promise<void> | void): void {
  try {
    const result = write();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Ошибка IndexedDB не должна ломать успешный HTTP action: store уже остается
    // главным источником видимого состояния, а cache восстановится через SWR.
  }
}

function currentOwnReactionUuid(
  store: MessengerMessageReactionStoreApi,
  messageUuid: MessengerUuid,
  emojiName: string,
): MessengerUuid | null {
  return store.getState().messagesById[messageUuid]?.ownReactionUuidsByEmojiName[emojiName] ?? null;
}

function isOwnReactionProjected(
  store: MessengerMessageReactionStoreApi,
  messageUuid: MessengerUuid,
  emojiName: string,
): boolean {
  const message = store.getState().messagesById[messageUuid];
  if (message == null) return false;
  if (message.ownReactionUuidsByEmojiName[emojiName] != null) return true;
  return message.pendingOwnReactionsByEmojiName?.[emojiName]?.operation === "add";
}

function hasPendingOwnReaction(
  store: MessengerMessageReactionStoreApi,
  messageUuid: MessengerUuid,
  emojiName: string,
): boolean {
  return (
    store.getState().messagesById[messageUuid]?.pendingOwnReactionsByEmojiName?.[emojiName] != null
  );
}

function createReactionOptimisticRequestId(): string {
  return `reaction:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function rollbackOwnReactionOptimisticState(
  store: MessengerMessageReactionStoreApi,
  messageUuid: MessengerUuid,
  emojiName: string,
  requestId: string,
): void {
  store.getState().rollbackOptimisticOwnMessageReaction(messageUuid, emojiName, requestId);
}

function applyOwnRowsToStore(
  store: MessengerMessageReactionStoreApi,
  messageUuid: MessengerUuid,
  rows:
    | readonly MessengerOwnMessageReactionCacheRow[]
    | readonly MessengerOwnMessageReactionCacheWrite[],
): void {
  store.getState().applyOwnMessageReactions(messageUuid, ownReactionProjectionRows(rows));
}

async function resolveOwnRowsFromApiForMessage({
  runtimeContext,
  requestOptions,
  ownerKey,
  messageUuid,
  action,
  client,
  cache,
  store,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  requestOptions: MessengerClientOptions;
  ownerKey: string;
  messageUuid: MessengerUuid;
  action: CapturedReactionAction;
  client: MessengerMessageReactionClientDeps;
  cache: Required<MessengerMessageReactionCacheDeps>;
  store: MessengerMessageReactionStoreApi;
}): Promise<MessengerOwnMessageReactionCacheWrite[] | null> {
  // GET запрашивает только реакции текущего пользователя. Ответ авторитетен
  // для одного messageUuid и полностью заменяет cache-проекцию этого сообщения.
  const dtoRows = await (client.getMessageReactions ?? defaultGetMessageReactions)(requestOptions, {
    messageUuid,
    userUuid: runtimeContext.userUuid,
  });
  if (action.isStale()) return null;

  const rows = dtoRows
    .filter(
      (dto) =>
        dto.message_uuid === messageUuid && reactionDtoMatchesCurrentUser(dto, runtimeContext),
    )
    .map(dtoToOwnReactionCacheWrite);
  writeReactionCacheBestEffort(() =>
    cache.replaceOwnMessageReactionsForMessage(ownerKey, messageUuid, rows),
  );
  applyOwnRowsToStore(store, messageUuid, rows);
  return rows;
}

async function resolveOwnReactionForMessageAndEmoji({
  runtimeContext,
  requestOptions,
  ownerKey,
  messageUuid,
  emojiName,
  action,
  client,
  cache,
  store,
}: {
  runtimeContext: WorkspaceRuntimeContext;
  requestOptions: MessengerClientOptions;
  ownerKey: string;
  messageUuid: MessengerUuid;
  emojiName: string;
  action: CapturedReactionAction;
  client: MessengerMessageReactionClientDeps;
  cache: Required<MessengerMessageReactionCacheDeps>;
  store: MessengerMessageReactionStoreApi;
}): Promise<MessengerOwnMessageReactionCacheWrite | MessengerOwnMessageReactionCacheRow | null> {
  const storeReactionUuid = currentOwnReactionUuid(store, messageUuid, emojiName);
  if (storeReactionUuid != null) {
    return {
      messageUuid,
      userUuid: runtimeContext.userUuid,
      reactionUuid: storeReactionUuid,
      emojiName,
      createdAt: "",
      updatedAt: "",
    };
  }

  const cachedRow = await cache.readOwnMessageReaction(ownerKey, messageUuid, emojiName);
  if (action.isStale()) return null;
  if (cachedRow != null) return cachedRow;

  const rows = await resolveOwnRowsFromApiForMessage({
    runtimeContext,
    requestOptions,
    ownerKey,
    messageUuid,
    action,
    client,
    cache,
    store,
  });
  if (rows == null) return null;

  return rows.find((row) => row.emojiName === emojiName) ?? null;
}

export async function hydrateMessengerOwnMessageReactionsFromCache({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  messageUuids,
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
}: MessengerVisibleOwnReactionsOptions): Promise<MessengerOwnReactionsSyncResult> {
  const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const normalizedUuids = normalizedMessageUuids(messageUuids);
  if (normalizedUuids.length === 0) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-message-list" };
  }

  const rows = await (
    cache.readOwnMessageReactions ?? defaultReactionCache.readOwnMessageReactions
  )(action.ownerKey, normalizedUuids);
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const groupedRows = groupOwnReactionRowsByMessage(rows);
  for (const messageUuid of normalizedUuids) {
    store.getState().applyOwnMessageReactions(messageUuid, groupedRows.get(messageUuid) ?? []);
  }

  return {
    status: "applied",
    ownerKey: action.ownerKey,
    messageUuids: normalizedUuids,
    reactions: rows.length,
  };
}

export async function revalidateMessengerOwnMessageReactions({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuids,
}: MessengerVisibleOwnReactionsOptions): Promise<MessengerOwnReactionsSyncResult> {
  const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const normalizedUuids = normalizedMessageUuids(messageUuids);
  if (normalizedUuids.length === 0) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-message-list" };
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  let reactionCount = 0;
  for (const messageUuid of normalizedUuids) {
    const rows = await resolveOwnRowsFromApiForMessage({
      runtimeContext,
      requestOptions,
      ownerKey: action.ownerKey,
      messageUuid,
      action,
      client,
      cache: {
        ...defaultReactionCache,
        ...cache,
      },
      store,
    });
    if (rows == null) {
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }
    reactionCount += rows.length;
  }

  return {
    status: "applied",
    ownerKey: action.ownerKey,
    messageUuids: normalizedUuids,
    reactions: reactionCount,
  };
}

export async function syncMessengerOwnerOwnMessageReactions({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuids,
}: MessengerVisibleOwnReactionsOptions): Promise<MessengerOwnReactionsSyncResult> {
  const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const normalizedUuids = normalizedMessageUuids(messageUuids);
  if (normalizedUuids.length === 0) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-message-list" };
  }

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const effectiveCache = { ...defaultReactionCache, ...cache };
  const dtoRows = await (client.getMessageReactions ?? defaultGetMessageReactions)(requestOptions, {
    userUuid: runtimeContext.userUuid,
  });
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const rows = dtoRows
    .filter((dto) => reactionDtoMatchesCurrentUser(dto, runtimeContext))
    .map(dtoToOwnReactionCacheWrite);
  const visibleUuids = new Set<MessengerUuid>(normalizedUuids);
  const visibleRows = rows.filter((row) => visibleUuids.has(row.messageUuid));
  const groupedRows = groupOwnReactionRowsByMessage(visibleRows);

  try {
    await effectiveCache.replaceOwnMessageReactionsForOwner(action.ownerKey, rows);
  } catch {
    // Cache sync is best-effort; store projection still reflects the server response.
  }
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  for (const messageUuid of normalizedUuids) {
    applyOwnRowsToStore(store, messageUuid, groupedRows.get(messageUuid) ?? []);
  }

  return {
    status: "applied",
    ownerKey: action.ownerKey,
    messageUuids: normalizedUuids,
    reactions: visibleRows.length,
  };
}

export async function addMessengerMessageReaction({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  emojiName,
}: MessengerSingleReactionOptions): Promise<MessengerMessageReactionActionResult> {
  const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };

  const normalizedEmojiName = normalizeEmojiName(emojiName);
  if (normalizedEmojiName == null) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-emoji" };
  }
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const effectiveCache = { ...defaultReactionCache, ...cache };
  const optimisticRequestId = createReactionOptimisticRequestId();
  store
    .getState()
    .beginOptimisticOwnMessageReaction(
      messageUuid,
      normalizedEmojiName,
      "add",
      optimisticRequestId,
      runtimeContext.userUuid,
    );

  try {
    const dto = await (client.createMessageReaction ?? defaultCreateMessageReaction)(
      requestOptions,
      {
        message_uuid: messageUuid,
        emoji_name: normalizedEmojiName,
      },
    );
    if (action.isStale()) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }

    const row = dtoToOwnReactionCacheWrite(dto);
    store.getState().setOwnMessageReaction(messageUuid, normalizedEmojiName, row.reactionUuid);
    store
      .getState()
      .settleOptimisticOwnMessageReaction(messageUuid, normalizedEmojiName, optimisticRequestId);
    writeReactionCacheBestEffort(() =>
      effectiveCache.upsertOwnMessageReaction(action.ownerKey, row),
    );
    return {
      status: "applied",
      ownerKey: action.ownerKey,
      messageUuid,
      emojiName: normalizedEmojiName,
      operation: "added",
      reactionUuid: row.reactionUuid,
    };
  } catch (error) {
    if (!isDuplicateReactionConflict(error)) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      throw error;
    }
    if (action.isStale()) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }

    let rows: MessengerOwnMessageReactionCacheWrite[] | null;
    try {
      rows = await resolveOwnRowsFromApiForMessage({
        runtimeContext,
        requestOptions,
        ownerKey: action.ownerKey,
        messageUuid,
        action,
        client,
        cache: effectiveCache,
        store,
      });
    } catch (resolutionError) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      throw resolutionError;
    }
    if (rows == null) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }
    rollbackOwnReactionOptimisticState(
      store,
      messageUuid,
      normalizedEmojiName,
      optimisticRequestId,
    );
    applyOwnRowsToStore(store, messageUuid, rows);
    const ownRow = rows.find((row) => row.emojiName === normalizedEmojiName) ?? null;
    return {
      status: "applied",
      ownerKey: action.ownerKey,
      messageUuid,
      emojiName: normalizedEmojiName,
      operation: "already-added",
      reactionUuid: ownRow?.reactionUuid ?? null,
    };
  }
}

export async function removeMessengerMessageReaction({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  emojiName,
}: MessengerSingleReactionOptions): Promise<MessengerMessageReactionActionResult> {
  const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
  if (action.ownerKey == null)
    return { status: "skipped", ownerKey: null, reason: "missing-context" };

  const normalizedEmojiName = normalizeEmojiName(emojiName);
  if (normalizedEmojiName == null) {
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-emoji" };
  }
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  const requestOptions = buildMessengerRequestOptions(runtimeContext, clientOptions, signal);
  const effectiveCache = { ...defaultReactionCache, ...cache };
  const projectedReactionUuid = currentOwnReactionUuid(store, messageUuid, normalizedEmojiName);
  const row =
    projectedReactionUuid != null
      ? {
          messageUuid,
          userUuid: runtimeContext.userUuid,
          reactionUuid: projectedReactionUuid,
          emojiName: normalizedEmojiName,
          createdAt: "",
          updatedAt: "",
        }
      : await resolveOwnReactionForMessageAndEmoji({
          runtimeContext,
          requestOptions,
          ownerKey: action.ownerKey,
          messageUuid,
          emojiName: normalizedEmojiName,
          action,
          client,
          cache: effectiveCache,
          store,
        });
  if (action.isStale())
    return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };

  if (row == null) {
    return addMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      client,
      cache: effectiveCache,
      signal,
      store,
      messageUuid,
      emojiName: normalizedEmojiName,
    });
  }

  const optimisticRequestId = createReactionOptimisticRequestId();
  store
    .getState()
    .beginOptimisticOwnMessageReaction(
      messageUuid,
      normalizedEmojiName,
      "remove",
      optimisticRequestId,
      runtimeContext.userUuid,
    );

  try {
    await (client.deleteMessageReaction ?? defaultDeleteMessageReaction)(
      requestOptions,
      row.reactionUuid,
    );
    if (action.isStale()) {
      rollbackOwnReactionOptimisticState(
        store,
        messageUuid,
        normalizedEmojiName,
        optimisticRequestId,
      );
      return { status: "skipped", ownerKey: action.ownerKey, reason: "stale-owner" };
    }

    store
      .getState()
      .settleOptimisticOwnMessageReaction(messageUuid, normalizedEmojiName, optimisticRequestId);
    writeReactionCacheBestEffort(() =>
      effectiveCache.deleteOwnMessageReaction(action.ownerKey, messageUuid, normalizedEmojiName),
    );
  } catch (error) {
    rollbackOwnReactionOptimisticState(
      store,
      messageUuid,
      normalizedEmojiName,
      optimisticRequestId,
    );
    throw error;
  }
  return {
    status: "applied",
    ownerKey: action.ownerKey,
    messageUuid,
    emojiName: normalizedEmojiName,
    operation: "removed",
    reactionUuid: row.reactionUuid,
  };
}

export async function toggleMessengerMessageReaction({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client = {},
  cache = defaultReactionCache,
  signal,
  store = useWorkspaceMessageStore,
  messageUuid,
  emojiName,
}: MessengerSingleReactionOptions): Promise<MessengerMessageReactionActionResult> {
  const normalizedEmojiName = normalizeEmojiName(emojiName);
  if (normalizedEmojiName == null) {
    const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
    return { status: "skipped", ownerKey: action.ownerKey, reason: "empty-emoji" };
  }

  if (hasPendingOwnReaction(store, messageUuid, normalizedEmojiName)) {
    const action = captureReactionAction(runtimeContext, getRuntimeContext, signal);
    return { status: "skipped", ownerKey: action.ownerKey, reason: "pending-reaction" };
  }

  if (isOwnReactionProjected(store, messageUuid, normalizedEmojiName)) {
    return removeMessengerMessageReaction({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      client,
      cache,
      signal,
      store,
      messageUuid,
      emojiName: normalizedEmojiName,
    });
  }

  const addResult = await addMessengerMessageReaction({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    client,
    cache,
    signal,
    store,
    messageUuid,
    emojiName: normalizedEmojiName,
  });
  if (addResult.status !== "applied" || addResult.operation !== "already-added") {
    return addResult;
  }

  return removeMessengerMessageReaction({
    runtimeContext,
    getRuntimeContext,
    clientOptions,
    client,
    cache,
    signal,
    store,
    messageUuid,
    emojiName: normalizedEmojiName,
  });
}

export function createMessengerReactionAggregateRevalidateHandler({
  runtimeContext,
  getRuntimeContext = () => runtimeContext,
  clientOptions,
  client,
  cache,
  signal,
  store = useWorkspaceMessageStore,
}: MessengerMessageReactionBaseOptions): (ownerKey: string, message: MessengerMessage) => void {
  const expectedOwnerKey = workspaceRuntimeOwnerKey(runtimeContext);

  // Realtime applier знает только ownerKey и aggregate. Эта фабрика замыкает
  // runtimeContext текущего route/runtime и превращает hook Agent C в безопасный
  // revalidate одного сообщения без добавления HTTP-знаний в realtime слой.
  return (ownerKey, message) => {
    if (ownerKey !== expectedOwnerKey) return;
    // Пустой aggregate тоже является важным сигналом: он означает, что сервер
    // больше не видит реакций у сообщения. В этом случае нужно перечитать own
    // rows и очистить локальную projection/cache, иначе последняя снятая
    // реакция останется подсвеченной после realtime update.
    void revalidateMessengerOwnMessageReactions({
      runtimeContext,
      getRuntimeContext,
      clientOptions,
      client,
      cache,
      signal,
      store,
      messageUuids: [message.uuid],
    });
  };
}
