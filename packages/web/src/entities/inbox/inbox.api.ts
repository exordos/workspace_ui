/**
 * Inbox data layer — server unread fetch, IDB bootstrap, and best-effort cache refresh after sync.
 */

import { persistChatMessagesToIndexedDb } from "~/entities/message/message-local-cache.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { fetchMessagesWithNarrowPage } from "~/shared/api/zulip-messages";
import {
  parseUnreadMessagesSnapshot,
  type ZulipUnreadMessagesSnapshot,
} from "~/shared/api/zulip-unread.lib";
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger, logApiCall } from "~/shared/lib/logger";
import { getInstanceMessagesAscending, upsertChatMessages } from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";
import { buildInboxEntries } from "./inbox.lib";
import type { InboxMuteFilterOptions } from "./inbox.lib";
import type { InboxEntry } from "./inbox.types";

const log = createLogger("inbox:api");

export interface FetchInboxEntriesWithSnapshotResult {
  entries: InboxEntry[];
  unreadSnapshot: ZulipUnreadMessagesSnapshot;
  unreadSnapshotComplete: boolean;
  unreadMessages: ZulipRawMessage[];
}

const EMPTY_UNREAD_SNAPSHOT: ZulipUnreadMessagesSnapshot = {
  streams: [],
  dms: [],
  totalCount: 0,
  mentionMessageIds: [],
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function persistUnreadMessagesToIdb(
  instanceId: string | null,
  messages: readonly MockMessage[],
  currentUserId: number | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!persistChatMessagesToIndexedDb()) return;
  if (!instanceId || messages.length === 0) return;
  throwIfAborted(signal);

  const messagesByChatKey = new Map<string, MockMessage[]>();
  for (const message of messages) {
    const chatKey = chatKeyFromMockMessage(message, currentUserId);
    if (chatKey == null) continue;
    const existing = messagesByChatKey.get(chatKey);
    if (existing) {
      existing.push(message);
    } else {
      messagesByChatKey.set(chatKey, [message]);
    }
  }

  if (messagesByChatKey.size === 0) return;

  const entries = Array.from(messagesByChatKey.entries());
  const results: PromiseSettledResult<unknown>[] = [];
  for (const [chatKey, chatMessages] of entries) {
    if (signal?.aborted) break;
    results.push(
      await Promise.allSettled([
        upsertChatMessages({
          instanceId,
          chatKey,
          messages: chatMessages,
          windowSizeN: zulipMessageCacheWindowNForChatKey(chatKey),
        }),
      ]).then(([result]) => result),
    );
  }

  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const chatKey = entries[index]?.[0] ?? "unknown";
    log.warn("Failed to persist inbox unread snapshot to message cache", {
      chatKey,
      error: String(result.reason),
    });
  });
}

function collectMentionMessageIds(
  messages: readonly MockMessage[],
  currentUserId: number | null,
): number[] {
  const mentionIds: number[] = [];
  for (const message of messages) {
    if (message.flags?.includes("read")) continue;
    if (!message.flags?.includes("mentioned")) continue;
    if (currentUserId != null && message.sender_id === currentUserId) continue;
    mentionIds.push(message.id);
  }
  return mentionIds;
}

function buildUnreadSnapshotFromInboxMessages(
  messages: readonly MockMessage[],
  rawMessages: readonly ZulipRawMessage[],
  currentUserId: number | null,
): ZulipUnreadMessagesSnapshot {
  const snapshot = parseUnreadMessagesSnapshot({ messages: rawMessages }) ?? EMPTY_UNREAD_SNAPSHOT;
  return {
    ...snapshot,
    mentionMessageIds: collectMentionMessageIds(messages, currentUserId),
  };
}

export async function fetchInboxEntriesWithSnapshot(
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<FetchInboxEntriesWithSnapshotResult> {
  const start = performance.now();
  try {
    const instanceId = getCurrentInstance()?.id ?? null;
    const page = await fetchMessagesWithNarrowPage(
      [{ operator: "is", operand: "unread" }],
      "newest",
      5000,
      0,
      { signal: requestOptions?.signal },
    );
    const { messages } = page;
    throwIfAborted(requestOptions?.signal);
    await persistUnreadMessagesToIdb(instanceId, messages, currentUserId, requestOptions?.signal);
    throwIfAborted(requestOptions?.signal);
    const durationMs = Math.round(performance.now() - start);
    logApiCall("GET", "/messages?narrow=is:unread", { status: 200, durationMs });
    const unreadMessages = messages.map(mockMessageToRawMessage);
    return {
      entries: buildInboxEntries(messages, currentUserId, options),
      unreadSnapshot: buildUnreadSnapshotFromInboxMessages(messages, unreadMessages, currentUserId),
      unreadSnapshotComplete: page.foundOldest,
      unreadMessages,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const aborted = isAbortError(err) || requestOptions?.signal?.aborted === true;
    logApiCall("GET", "/messages?narrow=is:unread", {
      durationMs,
      ...(aborted ? { aborted: true } : { error: String(err) }),
    });
    if (!aborted) {
      log.error("Failed to fetch inbox entries", { error: String(err) });
    }
    throw err;
  }
}

export async function fetchInboxEntries(
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
  requestOptions?: { signal?: AbortSignal },
): Promise<InboxEntry[]> {
  const result = await fetchInboxEntriesWithSnapshot(currentUserId, options, requestOptions);
  return result.entries;
}

/** Local inbox bootstrap from message IDB; unread = messages without the `read` flag. */
export async function hydrateInboxEntriesFromCache(
  instanceId: string | null,
  currentUserId: number | null = null,
  options: InboxMuteFilterOptions = {},
): Promise<InboxEntry[]> {
  if (instanceId == null) return [];
  const messages = await getInstanceMessagesAscending(instanceId);
  const unread = messages.filter((message) => !message.flags?.includes("read"));
  return buildInboxEntries(unread, currentUserId, options);
}
