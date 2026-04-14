/**
 * IndexedDB-слой для снимка mute-состояния.
 * Зачем нужен: при cold start дать UI мгновенное состояние mute до завершения register.
 * Что делает: сохраняет/читает/удаляет per-instance snapshot c muted streams и topic overrides.
 */
import { openMessageCacheDb } from "~/shared/lib/message-cache-db";

// Имя objectStore в общей IndexedDB, где лежит снимок mute-состояния.
const STORE_MUTE_SNAPSHOT = "muteSnapshot";

// Версия формата строки mute-снапшота. Нужна для будущих миграций формата.
export type MuteSnapshotRowVersion = 1;

// Сериализуемая запись одного topic-override в снапшоте.
export interface MuteSnapshotTopicRow {
  streamId: number;
  topic: string;
}

// Полный снимок mute-состояния для одного инстанса.
export interface MuteSnapshotRow {
  instanceId: string;
  version: MuteSnapshotRowVersion;
  savedAt: number;
  mutedStreamIds: number[];
  mutedTopics: MuteSnapshotTopicRow[];
  unmutedTopics: MuteSnapshotTopicRow[];
}

// Приводит любую причину ошибки IndexedDB к объекту Error.
function idbError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("indexedDB error", { cause: reason });
}

// Сохраняет снимок mute-состояния в IDB.
// Зачем нужен: write-through после локальных изменений/успешного register.
// Поведение: best-effort, не должен ронять UI при ошибке IDB.
export async function persistMuteSnapshotRow(row: MuteSnapshotRow): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_MUTE_SNAPSHOT).put(row);
    });
  } catch {
    // best-effort
  }
}

// Загружает снимок mute-состояния для конкретного инстанса.
// Возвращает null, если запись отсутствует или IDB недоступна/ошиблась.
export async function loadMuteSnapshotRow(instanceId: string): Promise<MuteSnapshotRow | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openMessageCacheDb();
    return await new Promise<MuteSnapshotRow | null>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readonly");
      const req = tx.objectStore(STORE_MUTE_SNAPSHOT).get(instanceId);
      req.onerror = () => reject(idbError(req.error));
      req.onsuccess = () => resolve((req.result as MuteSnapshotRow | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

// Удаляет снимок mute-состояния инстанса из IDB.
// Нужен для cleanup-сценариев; выполняется в best-effort режиме.
export async function deleteMuteSnapshotRow(instanceId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMessageCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MUTE_SNAPSHOT, "readwrite");
      tx.onerror = () => reject(idbError(tx.error));
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_MUTE_SNAPSHOT).delete(instanceId);
    });
  } catch {
    // best-effort
  }
}
