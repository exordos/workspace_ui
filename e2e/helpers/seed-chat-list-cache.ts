import type { Page } from "@playwright/test";
import { E2E_INSTANCE_ID } from "../mocks/zulip-default-responses";

const DB_NAME = "workspace-message-cache-v1";
const DB_VERSION = 7;
const STORE_CHAT_LIST_SNAPSHOT = "chatListSnapshot";

/** Minimal IndexedDB chat-list row so bootstrap can enter degraded (not blocked) mode. */
export async function seedChatListIndexedDb(page: Page, instanceId = E2E_INSTANCE_ID): Promise<void> {
  await page.evaluate(
    async ({ dbName, dbVersion, storeName, id }) => {
      const row = {
        instanceId: id,
        version: 1,
        currentUserId: 1,
        lastMessageId: 100,
        oldestMessageId: 1,
        streamsEntries: [
          [
            10,
            {
              stream_id: 10,
              name: "general",
              lastMessage: "Cached hello",
              time: "12:00",
              ts: 1_700_000_000,
              topics: [] as [string, unknown][],
            },
          ],
        ],
        dmsEntries: [] as [string, unknown][],
        messageIdToLocationEntries: [] as [number, unknown][],
        updatedAt: Date.now(),
      };

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "instanceId" });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
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
      dbVersion: DB_VERSION,
      storeName: STORE_CHAT_LIST_SNAPSHOT,
      id: instanceId,
    },
  );
}
