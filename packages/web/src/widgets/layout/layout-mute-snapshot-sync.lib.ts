/**
 * Централизованный debounce-sync mute-store в IndexedDB.
 * Зачем нужен: сохранять актуальный mute snapshot между перезапусками без лишней нагрузки на IDB.
 * Что делает: подписывается на mute-store, коалесцирует частые изменения и пишет один snapshot.
 */
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import type { MuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";
import { persistMuteSnapshotRow } from "~/shared/lib/mute-snapshot-db";

// Базовое debounce-окно для записи mute snapshot.
const MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS = 750;

// Параметры запуска синка.
interface StartMuteSnapshotSyncOptions {
  // ID активного инстанса (ключ строки в IDB).
  instanceId: string;
  // Кастомный debounce (в тестах/настройках).
  debounceMs?: number;
  // Инъекция persist-функции (для тестов и spy-моков).
  persistSnapshotRow?: (row: MuteSnapshotRow) => Promise<void>;
}

// Ссылки на tracked-поля mute-store.
interface MuteRefs {
  mutedStreamIds: ReturnType<typeof useMuteStore.getState>["mutedStreamIds"];
  mutedTopicKeys: ReturnType<typeof useMuteStore.getState>["mutedTopicKeys"];
  unmutedTopicKeys: ReturnType<typeof useMuteStore.getState>["unmutedTopicKeys"];
  followedTopicKeys: ReturnType<typeof useMuteStore.getState>["followedTopicKeys"];
}

// Определяет, изменились ли tracked-ссылки (дешевое сравнение по reference equality).
function hasTrackedMuteRefsChanged(prev: MuteRefs, next: MuteRefs): boolean {
  return (
    prev.mutedStreamIds !== next.mutedStreamIds ||
    prev.mutedTopicKeys !== next.mutedTopicKeys ||
    prev.unmutedTopicKeys !== next.unmutedTopicKeys ||
    prev.followedTopicKeys !== next.followedTopicKeys
  );
}

// Преобразует Set с ключами вида "streamId:topic" в сериализуемые строки snapshot.
function toSnapshotTopicRows(keys: ReadonlySet<string>): { streamId: number; topic: string }[] {
  const rows: { streamId: number; topic: string }[] = [];
  for (const key of keys) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex <= 0) continue;
    const streamId = Number(key.slice(0, separatorIndex));
    if (!Number.isInteger(streamId) || streamId <= 0) continue;
    const topic = key.slice(separatorIndex + 1);
    if (topic.length === 0) continue;
    rows.push({ streamId, topic });
  }
  return rows;
}

// Строит snapshot-строку из текущего состояния mute-store.
function buildMuteSnapshotRow(instanceId: string): MuteSnapshotRow {
  const state = useMuteStore.getState();
  const mutedStreamIds = Array.from(state.mutedStreamIds).filter(
    (streamId) => Number.isInteger(streamId) && streamId > 0,
  );
  return {
    instanceId,
    version: 1,
    savedAt: Date.now(),
    mutedStreamIds,
    mutedTopics: toSnapshotTopicRows(state.mutedTopicKeys),
    unmutedTopics: toSnapshotTopicRows(state.unmutedTopicKeys),
    followedTopics: toSnapshotTopicRows(state.followedTopicKeys),
  };
}

// Запускает синк mute-store -> IndexedDB и возвращает cleanup-функцию.
export function startMuteSnapshotSync(options: StartMuteSnapshotSyncOptions): () => void {
  const {
    instanceId,
    debounceMs = MUTE_SNAPSHOT_SYNC_DEBOUNCE_MS,
    persistSnapshotRow = persistMuteSnapshotRow,
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  // Флаг активной записи в IDB (защита от параллельных persist).
  let inFlight = false;
  // Флаг, что после текущей операции требуется еще один flush.
  let queued = false;

  // Стартовые tracked refs из текущего состояния store.
  let trackedRefs: MuteRefs = (() => {
    const state = useMuteStore.getState();
    return {
      mutedStreamIds: state.mutedStreamIds,
      mutedTopicKeys: state.mutedTopicKeys,
      unmutedTopicKeys: state.unmutedTopicKeys,
      followedTopicKeys: state.followedTopicKeys,
    };
  })();

  // Немедленный flush отложенных изменений (если запись не выполняется прямо сейчас).
  const flushNow = () => {
    if (inFlight || !queued) return;
    queued = false;
    inFlight = true;
    void persistSnapshotRow(buildMuteSnapshotRow(instanceId))
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        if (queued) {
          scheduleFlush();
        }
      });
  };

  // Планирует flush по debounce-таймеру.
  const scheduleFlush = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, debounceMs);
  };

  // Отмечает необходимость записи и запускает планировщик.
  const queueFlush = () => {
    queued = true;
    if (inFlight) return;
    scheduleFlush();
  };

  // Подписка на store: реагируем только на tracked refs.
  const unsubscribe = useMuteStore.subscribe((nextState) => {
    const nextRefs: MuteRefs = {
      mutedStreamIds: nextState.mutedStreamIds,
      mutedTopicKeys: nextState.mutedTopicKeys,
      unmutedTopicKeys: nextState.unmutedTopicKeys,
      followedTopicKeys: nextState.followedTopicKeys,
    };
    if (!hasTrackedMuteRefsChanged(trackedRefs, nextRefs)) {
      return;
    }
    trackedRefs = nextRefs;
    queueFlush();
  });

  return () => {
    // Cleanup: снимаем подписку, останавливаем таймер и пытаемся записать хвост изменений.
    unsubscribe();
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    flushNow();
  };
}
