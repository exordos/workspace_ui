import { fetchDmMessages, fetchMessages, fetchMessagesWithNarrow } from "~/shared/api/zulip";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  getChatMessagesAscending,
  getChatMeta,
  getStreamMessagesAscending,
  updateChatMetaPatch,
  upsertChatMessages,
} from "~/shared/lib/message-cache-db";
import { chatKeyFromContext, chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  ZULIP_DM_ANCHOR_NUM_AFTER,
  ZULIP_DM_ANCHOR_NUM_BEFORE,
  ZULIP_STREAM_ANCHOR_NUM_AFTER,
  ZULIP_STREAM_ANCHOR_NUM_BEFORE,
  ZULIP_STREAM_CHAT_NUM_BEFORE,
  zulipMessageCacheWindowN,
} from "~/shared/lib/zulip-message-window.lib";
import { upsertMessagesByChatPartitions } from "./message-cache-partition.lib";
import { parseDmKeyToUserIds } from "./message-chat-context.lib";
import { deriveFocusedPaginationFlags } from "./message-pagination-helpers.lib";
import type { CurrentChatContext } from "./message.model.types";

// Что делает: фиксирует три независимых сценария загрузки initial-ленты.
// Зачем: чтобы route-driven поведение (dm/topic/wide) было явным и тестируемым.
export type InitialLoadMode = "dm" | "stream-topic" | "stream-wide";

interface CachedSnapshot {
  messages: MockMessage[];
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

export interface LoadInitialMessagesRouteDrivenOptions {
  context: CurrentChatContext;
  focusedMessageId: number | null;
  currentUserId: number | null;
  persistToIndexedDb: boolean;
  instanceId: string | null;
  // Что делает: прокидывает отмену во всю initial pipeline.
  // Зачем: прерывать устаревший route-запрос до применения результатов.
  signal?: AbortSignal;
  // Что делает: сообщает вызывающему, что cache-first payload уже готов для UI.
  // Зачем: отключать блокирующий loader до окончания сетевого refresh.
  onCacheHydrated?: (snapshot: CachedSnapshot) => void;
}

export interface LoadInitialMessagesRouteDrivenResult {
  mode: InitialLoadMode;
  messages: MockMessage[];
  nextContext: CurrentChatContext;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

// Что делает: синхронно проверяет отмену текущего запроса.
// Зачем: не запускать следующую фазу пайплайна, если route уже сменился.
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

// Что делает: определяет стратегию загрузки строго по route-контексту.
export function resolveInitialLoadMode(context: CurrentChatContext): InitialLoadMode {
  if (context.type === "dm") return "dm";
  return context.streamWideView ? "stream-wide" : "stream-topic";
}

// Что делает: cache-first чтение для выбранного режима.
// Зачем: отдать UI сообщения сразу, не дожидаясь сети.
async function readCachedMessagesByMode(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  instanceId: string;
}): Promise<CachedSnapshot> {
  const { mode, context, instanceId } = options;
  if (mode === "stream-wide" && context.type === "stream") {
    // Что делает: wide-кэш собирается merge'ем всех topic-partitions stream'а.
    const cached = await getStreamMessagesAscending(instanceId, context.streamId).catch(
      () => [] as MockMessage[],
    );
    // Что делает: ограничивает bootstrap-окно wide до того же размера, что у API.
    const sliced = cached.slice(-ZULIP_STREAM_CHAT_NUM_BEFORE);
    return {
      messages: sliced,
      hasOlderMessages: sliced.length >= ZULIP_STREAM_CHAT_NUM_BEFORE,
      hasNewerMessages: false,
    };
  }

  const chatKey = chatKeyFromContext(context);
  const cached = await getChatMessagesAscending(instanceId, chatKey).catch(
    () => [] as MockMessage[],
  );
  const meta = await getChatMeta(instanceId, chatKey).catch(() => null);
  return {
    messages: cached,
    hasOlderMessages: meta?.reachedOldest !== true,
    hasNewerMessages: meta?.reachedNewest !== true,
  };
}

// Что делает: выбирает корректный сетевой запрос для каждого route-режима.
// Зачем: исключить смешение stream-wide и topic-narrow сценариев.
async function fetchNetworkMessagesByMode(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  focusedMessageId: number | null;
  currentUserId: number | null;
  signal?: AbortSignal;
}): Promise<MockMessage[]> {
  const { mode, context, focusedMessageId, currentUserId, signal } = options;
  throwIfAborted(signal);
  if (context.type === "dm") {
    if (focusedMessageId != null) {
      return fetchMessagesWithNarrow(
        [{ operator: "dm", operand: parseDmKeyToUserIds(context.dmKey, currentUserId) }],
        focusedMessageId,
        ZULIP_DM_ANCHOR_NUM_BEFORE,
        ZULIP_DM_ANCHOR_NUM_AFTER,
        { signal, applyMarkdown: true },
      );
    }
    return fetchDmMessages(parseDmKeyToUserIds(context.dmKey, currentUserId), { signal });
  }

  if (focusedMessageId != null) {
    const narrow =
      mode === "stream-wide"
        ? [{ operator: "stream", operand: context.streamName }]
        : [
            { operator: "stream", operand: context.streamName },
            { operator: "topic", operand: context.topic },
          ];
    return fetchMessagesWithNarrow(
      narrow,
      focusedMessageId,
      ZULIP_STREAM_ANCHOR_NUM_BEFORE,
      ZULIP_STREAM_ANCHOR_NUM_AFTER,
      { signal, applyMarkdown: true },
    );
  }

  if (mode === "stream-wide") {
    // Что делает: wide-mode всегда грузит stream-narrow без topic.
    return fetchMessages(context.streamName, undefined, undefined, { signal });
  }
  // Что делает: explicit topic-route всегда грузит topic-narrow; empty topic мапится в пустой operand в API.
  return fetchMessages(context.streamName, context.topic, undefined, { signal });
}

// Что делает: нормализует итоговый контекст после API-ответа.
// Зачем: сохранить согласованность store-контекста с фактически полученными сообщениями.
function resolveNextContextFromApi(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  messages: readonly MockMessage[];
  currentUserId: number | null;
}): CurrentChatContext {
  const { mode, context, messages, currentUserId } = options;
  if (messages.length === 0) {
    return context;
  }

  if (context.type === "stream") {
    if (mode === "stream-wide") {
      return context;
    }
    const first = messages[0]!;
    const topic = normalizeTopicForIdentity(first.subject ?? "");
    return { ...context, topic, streamWideView: false };
  }

  const first = messages[0]!;
  const fromKey = chatKeyFromMockMessage(first, currentUserId);
  if (!fromKey?.startsWith("dm:")) {
    return context;
  }
  const dmKey = fromKey.slice(3);
  if (dmKey === context.dmKey) {
    return context;
  }
  return { type: "dm", dmKey };
}

// Что делает: пишет API-результат в IDB по правильной стратегии (dm/topic/wide).
// Зачем: wide не должен перетирать topic-партиции одним ключом.
async function persistNetworkMessagesByMode(options: {
  mode: InitialLoadMode;
  context: CurrentChatContext;
  nextContext: CurrentChatContext;
  messages: readonly MockMessage[];
  currentUserId: number | null;
  persistToIndexedDb: boolean;
  instanceId: string | null;
}): Promise<void> {
  const { mode, context, nextContext, messages, currentUserId, persistToIndexedDb, instanceId } =
    options;
  if (!persistToIndexedDb || instanceId == null) return;

  if (mode === "stream-wide" && context.type === "stream") {
    if (messages.length === 0) return;
    // Что делает: wide-ответ раскладывается по фактическим topic keys.
    await upsertMessagesByChatPartitions({
      instanceId,
      currentUserId,
      messages,
      resetBoundaries: true,
    });
    return;
  }

  const chatKeyForMeta =
    messages.length > 0
      ? (chatKeyFromMockMessage(messages[0]!, currentUserId) ?? chatKeyFromContext(nextContext))
      : chatKeyFromContext(nextContext);
  await updateChatMetaPatch(instanceId, chatKeyForMeta, {
    reachedOldest: false,
    reachedNewest: false,
  });
  if (messages.length === 0) return;
  await upsertChatMessages({
    instanceId,
    chatKey: chatKeyForMeta,
    messages,
    windowSizeN: zulipMessageCacheWindowN(nextContext),
  });
}

// Что делает: полный route-driven initial pipeline:
// mode -> cache-first -> network refresh -> persist.
// Зачем: единая точка orchestration без бизнес-логики в UI.
export async function loadInitialMessagesRouteDriven(
  options: LoadInitialMessagesRouteDrivenOptions,
): Promise<LoadInitialMessagesRouteDrivenResult> {
  throwIfAborted(options.signal);
  const mode = resolveInitialLoadMode(options.context);

  if (
    options.persistToIndexedDb &&
    options.instanceId != null &&
    options.focusedMessageId == null
  ) {
    // Что делает: пытается прогреть UI кэшем ещё до сети.
    const cachedSnapshot = await readCachedMessagesByMode({
      mode,
      context: options.context,
      instanceId: options.instanceId,
    });
    throwIfAborted(options.signal);
    if (cachedSnapshot.messages.length > 0) {
      options.onCacheHydrated?.(cachedSnapshot);
    }
  }

  const messages = await fetchNetworkMessagesByMode({
    mode,
    context: options.context,
    focusedMessageId: options.focusedMessageId,
    currentUserId: options.currentUserId,
    signal: options.signal,
  });
  // Belt-and-suspenders: some transports/clients resolve failures as empty message lists while offline.
  if (messages.length === 0 && typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Network offline");
  }
  throwIfAborted(options.signal);
  const flags = deriveFocusedPaginationFlags(messages, options.focusedMessageId);
  const nextContext = resolveNextContextFromApi({
    mode,
    context: options.context,
    messages,
    currentUserId: options.currentUserId,
  });

  await persistNetworkMessagesByMode({
    mode,
    context: options.context,
    nextContext,
    messages,
    currentUserId: options.currentUserId,
    persistToIndexedDb: options.persistToIndexedDb,
    instanceId: options.instanceId,
  });
  throwIfAborted(options.signal);

  return {
    mode,
    messages,
    nextContext,
    hasOlderMessages: flags.hasOlderMessages,
    hasNewerMessages: flags.hasNewerMessages,
  };
}
