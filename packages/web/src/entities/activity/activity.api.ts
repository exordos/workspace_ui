/**
 * Activity data layer — server page fetch and best-effort message IDB sync after refresh.
 */
import { persistChatMessagesToIndexedDb } from "~/entities/message/message-local-cache.lib";
import { getCurrentInstance } from "~/shared/api/client";
import { fetchActivityMessagesPage, rawMessageToMockMessage } from "~/shared/api/zulip-messages";
import type {
  ActivityFilter,
  ActivityMessagesPageResult,
  ZulipRawMessage,
} from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { upsertChatMessages } from "~/shared/lib/message-cache-db";
import { chatKeyFromMockMessage } from "~/shared/lib/message-cache-keys.lib";
import { zulipMessageCacheWindowNForChatKey } from "~/shared/lib/zulip-message-window.lib";

const log = createLogger("activity:api");

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function persistActivityMessagesToIdb(
  instanceId: string | null,
  messages: readonly ZulipRawMessage[],
  currentUserId: number | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!persistChatMessagesToIndexedDb()) return;
  if (!instanceId || messages.length === 0) return;
  throwIfAborted(signal);

  const messagesByChatKey = new Map<string, ReturnType<typeof rawMessageToMockMessage>[]>();
  for (const message of messages) {
    const mapped = rawMessageToMockMessage(message);
    const chatKey = chatKeyFromMockMessage(mapped, currentUserId);
    if (chatKey == null) continue;
    const existing = messagesByChatKey.get(chatKey);
    if (existing) {
      existing.push(mapped);
    } else {
      messagesByChatKey.set(chatKey, [mapped]);
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
    log.warn("Failed to persist activity snapshot to message cache", {
      chatKey,
      error: String(result.reason),
    });
  });
}

export async function fetchActivityMessagesPageWithPersist(
  filter: ActivityFilter,
  currentUserId?: number | null,
  anchor: number | "newest" = "newest",
  numBefore = 200,
  options?: { signal?: AbortSignal },
): Promise<ActivityMessagesPageResult> {
  const normalizedCurrentUserId = currentUserId ?? null;
  const instanceId = getCurrentInstance()?.id ?? null;
  const page = await fetchActivityMessagesPage(
    filter,
    normalizedCurrentUserId,
    anchor,
    numBefore,
    options,
  );
  throwIfAborted(options?.signal);
  await persistActivityMessagesToIdb(
    instanceId,
    page.messages,
    normalizedCurrentUserId,
    options?.signal,
  );
  throwIfAborted(options?.signal);
  return page;
}
