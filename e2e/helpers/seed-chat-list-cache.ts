import type { Page } from "@playwright/test";
import {
  E2E_INSTANCE_ID,
  E2E_MESSAGE_UUID,
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
} from "../mocks/messenger-default-responses";

/** Must match `MESSAGE_CACHE_DB_NAME` in `packages/web/src/shared/lib/message-cache-db.ts`. */
const DB_NAME = "workspace-message-cache-v1";
const STORE_CHAT_LIST_SNAPSHOT = "chatListSnapshot";

/**
 * Minimal IndexedDB chat-list row so bootstrap can enter degraded (not blocked) mode.
 * Call after the app shell has loaded once so the DB schema exists (currently v8+).
 */
export async function seedChatListIndexedDb(
  page: Page,
  instanceId = E2E_INSTANCE_ID,
): Promise<void> {
  await page.evaluate(
    async ({ dbName, storeName, id, messageUuid, streamUuid, topicUuid, userUuid }) => {
      const row = {
        instanceId: id,
        version: 1,
        currentUserId: userUuid,
        lastMessageId: messageUuid,
        oldestMessageId: messageUuid,
        streamsEntries: [
          [
            streamUuid,
            {
              streamUuid,
              defaultTopicUuid: topicUuid,
              name: "general",
              lastMessage: "Cached hello",
              time: "12:00",
              ts: 1_700_000_000,
              topics: [
                [
                  "general",
                  {
                    topicUuid,
                    subject: "general",
                    lastMessage: "Cached hello",
                    time: "12:00",
                    ts: 1_700_000_000,
                    unreadCount: 0,
                    lastMessageId: messageUuid,
                  },
                ],
              ],
            },
          ],
        ],
        dmsEntries: [] as [string, unknown][],
        messageIdToLocationEntries: [
          [
            messageUuid,
            {
              type: "stream",
              streamUuid,
              topic: "general",
              topicUuid,
            },
          ],
        ],
        updatedAt: Date.now(),
      };

      await new Promise<void>((resolve, reject) => {
        // Open without a fixed version: app must have created the DB on first load (see message-cache-db.ts).
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            reject(new Error(`indexedDB store missing: ${storeName}`));
            return;
          }
          const tx = db.transaction(storeName, "readwrite");
          tx.onerror = () => reject(tx.error ?? new Error("indexedDB tx failed"));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.objectStore(storeName).put(row);
        };
      });
    },
    {
      dbName: DB_NAME,
      storeName: STORE_CHAT_LIST_SNAPSHOT,
      id: instanceId,
      messageUuid: E2E_MESSAGE_UUID,
      streamUuid: E2E_STREAM_UUID,
      topicUuid: E2E_TOPIC_UUID,
      userUuid: E2E_USER_UUID,
    },
  );
}
