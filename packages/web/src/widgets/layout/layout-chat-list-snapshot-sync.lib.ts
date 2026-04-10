// Централизованный синк chat-list снапшота в IndexedDB.
// Нужен, чтобы состояние unread/списка чатов не устаревало между перезапусками
// и записывалось из одного места вместо разрозненных вызовов persist.
import { persistChatListSnapshotToIndexedDb } from "~/entities/chat-list/chat-list-snapshot-persist.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

// Базовое окно debounce для записи снапшота в IDB.
const CHAT_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

// Параметры запуска синка.
interface StartChatListSnapshotSyncOptions {
  // ID текущего инстанса (ключ хранения в IndexedDB).
  instanceId: string;
  // Кастомный debounce для тестов/тонкой настройки.
  debounceMs?: number;
  // Точка внедрения persist-функции (в тестах подменяется spy-моком).
  persistSnapshot?: (instanceId: string) => Promise<void>;
}

// Ссылки на части стора, по которым отслеживается факт изменения chat-list.
interface ChatListRefs {
  streamsMap: ReturnType<typeof useChatListStore.getState>["streamsMap"];
  dmsMap: ReturnType<typeof useChatListStore.getState>["dmsMap"];
  messageIdToLocation: ReturnType<typeof useChatListStore.getState>["messageIdToLocation"];
  currentUserId: ReturnType<typeof useChatListStore.getState>["currentUserId"];
}

// Проверяем изменения только по ссылкам tracked-полей.
// Это дешево и совместимо с иммутабельной моделью обновлений в Zustand-store.
function hasTrackedChatListRefsChanged(prev: ChatListRefs, next: ChatListRefs): boolean {
  return (
    prev.streamsMap !== next.streamsMap ||
    prev.dmsMap !== next.dmsMap ||
    prev.messageIdToLocation !== next.messageIdToLocation ||
    prev.currentUserId !== next.currentUserId
  );
}

// Запускает подписку на chat-list и возвращает cleanup-функцию.
export function startChatListSnapshotSync(options: StartChatListSnapshotSyncOptions): () => void {
  const {
    instanceId,
    debounceMs = CHAT_LIST_SNAPSHOT_SYNC_DEBOUNCE_MS,
    persistSnapshot = persistChatListSnapshotToIndexedDb,
  } = options;

  // Таймер debounce.
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Флаг текущей записи в IDB (чтобы не запускать параллельные persist).
  let inFlight = false;
  // Флаг "нужно записать", если за время debounce/записи пришли изменения.
  let queued = false;

  // Начальные ссылки tracked-полей.
  let trackedRefs: ChatListRefs = (() => {
    const state = useChatListStore.getState();
    return {
      streamsMap: state.streamsMap,
      dmsMap: state.dmsMap,
      messageIdToLocation: state.messageIdToLocation,
      currentUserId: state.currentUserId,
    };
  })();

  // Немедленный flush очереди (если запись не в процессе).
  const flushNow = () => {
    if (inFlight || !queued) return;
    queued = false;
    inFlight = true;
    logChatListFlow("idb: chatListSnapshot persist flush (start)", { instanceId });
    void persistSnapshot(instanceId)
      .catch(() => {
        logChatListFlow("idb: chatListSnapshot persist flush (persist rejected)", { instanceId });
      })
      .finally(() => {
        inFlight = false;
        logChatListFlow("idb: chatListSnapshot persist flush (done)", { instanceId });
        // Если во время записи накопились новые изменения, планируем следующий flush.
        if (queued) {
          scheduleFlush();
        }
      });
  };

  // Планирует flush через debounce-окно.
  const scheduleFlush = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, debounceMs);
  };

  // Помечает необходимость записи.
  const queueFlush = () => {
    const wasQueued = queued;
    queued = true;
    logChatListFlow(
      wasQueued
        ? "idb: chatListSnapshot persist re-queued (while pending or writing)"
        : "idb: chatListSnapshot persist queued (store maps changed)",
      { instanceId, inFlight },
    );
    if (inFlight) return;
    scheduleFlush();
  };

  // Подписка на store: реагируем только на изменение tracked refs.
  const unsubscribe = useChatListStore.subscribe((nextState) => {
    const nextRefs: ChatListRefs = {
      streamsMap: nextState.streamsMap,
      dmsMap: nextState.dmsMap,
      messageIdToLocation: nextState.messageIdToLocation,
      currentUserId: nextState.currentUserId,
    };
    if (!hasTrackedChatListRefsChanged(trackedRefs, nextRefs)) {
      return;
    }
    trackedRefs = nextRefs;
    queueFlush();
  });

  return () => {
    unsubscribe();
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    // На cleanup стараемся не потерять последний апдейт.
    flushNow();
  };
}
