/** Pin store — tracks which chats are pinned in each folder. */
import { create } from "zustand";
// eslint-disable-next-line import-x/order -- external + internal multiline import; false positive
import {
  areEquivalentChatIds,
  canonicalizeChatId,
  folderItemLookupKeysForChatId,
} from "~/features/folder-sync/folder-sync-chat-id.lib";
function setFolderItemUuidEntry(
  folderItemMap: Map<string, string>,
  chatId: string,
  folderItemUuid: string,
): void {
  for (const key of folderItemLookupKeysForChatId(chatId)) {
    folderItemMap.set(key, folderItemUuid);
  }
}

function removeFolderItemUuidEntries(folderItemMap: Map<string, string>, chatId: string): void {
  for (const key of folderItemLookupKeysForChatId(chatId)) {
    folderItemMap.delete(key);
  }
}
import {
  buildPinnedChatSortIndexLookup,
  lookupPinnedSortIndex,
} from "~/features/pin-chat/pin-chat-order.lib";
import { logStoreAction } from "~/shared/lib/logger";

/** Module-level constant for empty pinned list (performance: avoid new [] per call). */
const EMPTY_PINNED: string[] = [];

function pinKey(folderId: string, chatId: string): string {
  return `${folderId}:${chatId}`;
}

function findStoredChatId(folderChatIds: ReadonlySet<string>, chatId: string): string | null {
  for (const storedChatId of folderChatIds) {
    if (areEquivalentChatIds(storedChatId, chatId)) {
      return storedChatId;
    }
  }
  return null;
}

/** Newer pins first (descending pinned_at). */
function comparePinnedAtDesc(leftPinnedAt: string, rightPinnedAt: string): number {
  return rightPinnedAt.localeCompare(leftPinnedAt);
}

function sortPinnedChatIds(
  chatIds: readonly string[],
  pinnedAtByChatId: ReadonlyMap<string, string> | undefined,
): string[] {
  return [...chatIds].sort((leftChatId, rightChatId) => {
    const leftPinnedAt = pinnedAtByChatId?.get(leftChatId) ?? "";
    const rightPinnedAt = pinnedAtByChatId?.get(rightChatId) ?? "";
    const byPinnedAt = comparePinnedAtDesc(leftPinnedAt, rightPinnedAt);
    if (byPinnedAt !== 0) {
      return byPinnedAt;
    }
    return leftChatId.localeCompare(rightChatId);
  });
}

/** Recomputes sorted ids + alias lookup for one folder (call only when that folder's pins change). */
function updateFolderPinCacheEntry(
  folderId: string,
  folderSet: ReadonlySet<string>,
  pinnedAtByChatId: ReadonlyMap<string, string> | undefined,
  sortedPinnedIdsByFolder: Map<string, string[]>,
  pinnedSortLookupByFolder: Map<string, Map<string, number>>,
): void {
  if (folderSet.size === 0) {
    sortedPinnedIdsByFolder.delete(folderId);
    pinnedSortLookupByFolder.delete(folderId);
    return;
  }
  const sorted = sortPinnedChatIds(Array.from(folderSet), pinnedAtByChatId);
  sortedPinnedIdsByFolder.set(folderId, sorted);
  pinnedSortLookupByFolder.set(folderId, buildPinnedChatSortIndexLookup(sorted));
}

function rebuildAllFolderPinCaches(
  folderPins: Map<string, Set<string>>,
  pinnedAtByFolder: Map<string, Map<string, string>>,
): {
  sortedPinnedIdsByFolder: Map<string, string[]>;
  pinnedSortLookupByFolder: Map<string, Map<string, number>>;
} {
  const sortedPinnedIdsByFolder = new Map<string, string[]>();
  const pinnedSortLookupByFolder = new Map<string, Map<string, number>>();
  for (const [folderId, folderSet] of folderPins) {
    updateFolderPinCacheEntry(
      folderId,
      folderSet,
      pinnedAtByFolder.get(folderId),
      sortedPinnedIdsByFolder,
      pinnedSortLookupByFolder,
    );
  }
  return { sortedPinnedIdsByFolder, pinnedSortLookupByFolder };
}

interface PinStoreState {
  pinnedKeys: Set<string>;
  folderPins: Map<string, Set<string>>;
  pinnedAtByFolder: Map<string, Map<string, string>>;
  folderItemIds: Map<string, Map<string, string>>;
  /** Sorted pinned chat ids per folder — rebuilt on pin/unpin/setFromServer only. */
  sortedPinnedIdsByFolder: Map<string, string[]>;
  /** chat_id alias → sort index; avoids re-sorting in getPinnedSortIndex. */
  pinnedSortLookupByFolder: Map<string, Map<string, number>>;

  pinChat: (
    folderId: string,
    chatId: string,
    options?: { folderItemUuid?: string; pinnedAt?: string },
  ) => void;
  unpinChat: (folderId: string, chatId: string) => void;
  isPinned: (folderId: string, chatId: string) => boolean;
  getPinnedChatIds: (folderId: string) => string[];
  getPinnedSortIndex: (folderId: string, chatId: string) => number;
  getFolderItemUuid: (folderId: string, chatId: string) => string | null;

  setFromServer: (
    pins: {
      folderUuid: string;
      folderItemUuid: string;
      chatId: string;
      orderIndex: number;
      pinnedAt: string | null;
    }[],
  ) => void;
  clear: () => void;
}

export const usePinStore = create<PinStoreState>((set, get) => ({
  pinnedKeys: new Set(),
  folderPins: new Map(),
  pinnedAtByFolder: new Map(),
  folderItemIds: new Map(),
  sortedPinnedIdsByFolder: new Map(),
  pinnedSortLookupByFolder: new Map(),

  pinChat(folderId, chatId, options) {
    logStoreAction("pin", "pinChat", { folderId, chatId });
    set((s) => {
      const nextFolder = new Map(s.folderPins);
      const folderSet = new Set(nextFolder.get(folderId) ?? []);
      const existingStoredChatId = findStoredChatId(folderSet, chatId);
      if (existingStoredChatId != null) {
        folderSet.delete(existingStoredChatId);
      }
      folderSet.add(chatId);
      nextFolder.set(folderId, folderSet);

      const nextPinnedAtByFolder = new Map(s.pinnedAtByFolder);
      const pinnedAtByChatId = new Map(nextPinnedAtByFolder.get(folderId) ?? []);
      if (existingStoredChatId != null) {
        pinnedAtByChatId.delete(existingStoredChatId);
      }
      pinnedAtByChatId.set(chatId, options?.pinnedAt ?? new Date().toISOString());
      nextPinnedAtByFolder.set(folderId, pinnedAtByChatId);

      const nextKeys = new Set(s.pinnedKeys);
      if (existingStoredChatId != null) {
        nextKeys.delete(pinKey(folderId, existingStoredChatId));
      }
      nextKeys.add(pinKey(folderId, chatId));

      const nextFolderItemIds = new Map(s.folderItemIds);
      if (options?.folderItemUuid) {
        const folderItemMap = new Map(nextFolderItemIds.get(folderId) ?? []);
        if (existingStoredChatId != null) {
          removeFolderItemUuidEntries(folderItemMap, existingStoredChatId);
        }
        setFolderItemUuidEntry(folderItemMap, chatId, options.folderItemUuid);
        nextFolderItemIds.set(folderId, folderItemMap);
      }

      const nextSortedPinnedIdsByFolder = new Map(s.sortedPinnedIdsByFolder);
      const nextPinnedSortLookupByFolder = new Map(s.pinnedSortLookupByFolder);
      updateFolderPinCacheEntry(
        folderId,
        folderSet,
        pinnedAtByChatId,
        nextSortedPinnedIdsByFolder,
        nextPinnedSortLookupByFolder,
      );

      return {
        pinnedKeys: nextKeys,
        folderPins: nextFolder,
        pinnedAtByFolder: nextPinnedAtByFolder,
        folderItemIds: nextFolderItemIds,
        sortedPinnedIdsByFolder: nextSortedPinnedIdsByFolder,
        pinnedSortLookupByFolder: nextPinnedSortLookupByFolder,
      };
    });
  },

  unpinChat(folderId, chatId) {
    logStoreAction("pin", "unpinChat", { folderId, chatId });
    set((s) => {
      const nextFolder = new Map(s.folderPins);
      const folderSet = new Set(nextFolder.get(folderId) ?? []);
      const storedChatId = findStoredChatId(folderSet, chatId);
      if (storedChatId != null) {
        folderSet.delete(storedChatId);
      }
      nextFolder.set(folderId, folderSet);

      const nextKeys = new Set(s.pinnedKeys);
      if (storedChatId != null) {
        nextKeys.delete(pinKey(folderId, storedChatId));
      }

      const nextPinnedAtByFolder = new Map(s.pinnedAtByFolder);
      const pinnedAtByChatId = new Map(nextPinnedAtByFolder.get(folderId) ?? []);
      if (storedChatId != null) {
        pinnedAtByChatId.delete(storedChatId);
      }
      nextPinnedAtByFolder.set(folderId, pinnedAtByChatId);

      const nextSortedPinnedIdsByFolder = new Map(s.sortedPinnedIdsByFolder);
      const nextPinnedSortLookupByFolder = new Map(s.pinnedSortLookupByFolder);
      updateFolderPinCacheEntry(
        folderId,
        folderSet,
        pinnedAtByChatId,
        nextSortedPinnedIdsByFolder,
        nextPinnedSortLookupByFolder,
      );

      return {
        pinnedKeys: nextKeys,
        folderPins: nextFolder,
        pinnedAtByFolder: nextPinnedAtByFolder,
        sortedPinnedIdsByFolder: nextSortedPinnedIdsByFolder,
        pinnedSortLookupByFolder: nextPinnedSortLookupByFolder,
      };
    });
  },

  isPinned(folderId, chatId) {
    const folderSet = get().folderPins.get(folderId);
    if (!folderSet || folderSet.size === 0) {
      return false;
    }
    return findStoredChatId(folderSet, chatId) != null;
  },

  getPinnedChatIds(folderId) {
    return get().sortedPinnedIdsByFolder.get(folderId) ?? EMPTY_PINNED;
  },

  getPinnedSortIndex(folderId, chatId) {
    const lookup = get().pinnedSortLookupByFolder.get(folderId);
    if (lookup == null) {
      return -1;
    }
    return lookupPinnedSortIndex(lookup, chatId);
  },

  getFolderItemUuid(folderId, chatId) {
    const folderItemMap = get().folderItemIds.get(folderId);
    if (!folderItemMap) {
      return null;
    }
    return folderItemMap.get(canonicalizeChatId(chatId)) ?? null;
  },

  setFromServer(pins) {
    logStoreAction("pin", "setFromServer", { count: pins.length });
    // Empty snapshot = folder items cache not hydrated yet — do not wipe pin store
    // (would drop folderItemUuid mappings and break pin/unpin API resolution).
    if (pins.length === 0) {
      logStoreAction("pin", "setFromServer:skipped-empty", {});
      return;
    }
    const keys = new Set<string>();
    const folders = new Map<string, Set<string>>();
    const folderItemIds = new Map<string, Map<string, string>>();
    const pinnedAtByFolder = new Map<string, Map<string, string>>();

    for (const { folderUuid, folderItemUuid, chatId, pinnedAt } of pins) {
      const folderItemMap = new Map(folderItemIds.get(folderUuid) ?? []);
      setFolderItemUuidEntry(folderItemMap, chatId, folderItemUuid);
      folderItemIds.set(folderUuid, folderItemMap);

      if (pinnedAt == null) continue;

      keys.add(pinKey(folderUuid, chatId));
      const folderSet = new Set(folders.get(folderUuid) ?? []);
      folderSet.add(chatId);
      folders.set(folderUuid, folderSet);

      const pinnedAtByChatId = new Map(pinnedAtByFolder.get(folderUuid) ?? []);
      pinnedAtByChatId.set(chatId, pinnedAt);
      pinnedAtByFolder.set(folderUuid, pinnedAtByChatId);
    }

    const { sortedPinnedIdsByFolder, pinnedSortLookupByFolder } = rebuildAllFolderPinCaches(
      folders,
      pinnedAtByFolder,
    );

    set({
      pinnedKeys: keys,
      folderPins: folders,
      pinnedAtByFolder,
      folderItemIds,
      sortedPinnedIdsByFolder,
      pinnedSortLookupByFolder,
    });
  },

  clear() {
    logStoreAction("pin", "clear", {});
    set({
      pinnedKeys: new Set(),
      folderPins: new Map(),
      pinnedAtByFolder: new Map(),
      folderItemIds: new Map(),
      sortedPinnedIdsByFolder: new Map(),
      pinnedSortLookupByFolder: new Map(),
    });
  },
}));
