/**
 * Pin store — tracks which chats are pinned in each folder.
 */

import { create } from "zustand";
import { areEquivalentChatIds } from "~/features/folder-sync/folder-sync-chat-id.lib";
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

interface PinStoreState {
  pinnedKeys: Set<string>;
  folderPins: Map<string, Set<string>>;
  pinnedAtByFolder: Map<string, Map<string, string>>;
  folderItemIds: Map<string, Map<string, string>>;

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
          const existingUuid = folderItemMap.get(existingStoredChatId);
          if (existingUuid != null) {
            folderItemMap.delete(existingStoredChatId);
            folderItemMap.set(chatId, existingUuid);
          }
        }
        folderItemMap.set(chatId, options.folderItemUuid);
        nextFolderItemIds.set(folderId, folderItemMap);
      }

      return {
        pinnedKeys: nextKeys,
        folderPins: nextFolder,
        pinnedAtByFolder: nextPinnedAtByFolder,
        folderItemIds: nextFolderItemIds,
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

      return {
        pinnedKeys: nextKeys,
        folderPins: nextFolder,
        pinnedAtByFolder: nextPinnedAtByFolder,
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
    const folderSet = get().folderPins.get(folderId);
    if (!folderSet || folderSet.size === 0) return EMPTY_PINNED;
    return sortPinnedChatIds(Array.from(folderSet), get().pinnedAtByFolder.get(folderId));
  },

  getPinnedSortIndex(folderId, chatId) {
    const pinnedIds = get().getPinnedChatIds(folderId);
    for (let index = 0; index < pinnedIds.length; index++) {
      const pinnedChatId = pinnedIds[index];
      if (pinnedChatId != null && areEquivalentChatIds(pinnedChatId, chatId)) {
        return index;
      }
    }
    return -1;
  },

  getFolderItemUuid(folderId, chatId) {
    const folderItemMap = get().folderItemIds.get(folderId);
    if (!folderItemMap) {
      return null;
    }
    for (const [storedChatId, uuid] of folderItemMap) {
      if (areEquivalentChatIds(storedChatId, chatId)) {
        return uuid;
      }
    }
    return null;
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
      folderItemMap.set(chatId, folderItemUuid);
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

    set({ pinnedKeys: keys, folderPins: folders, pinnedAtByFolder, folderItemIds });
  },

  clear() {
    logStoreAction("pin", "clear", {});
    set({
      pinnedKeys: new Set(),
      folderPins: new Map(),
      pinnedAtByFolder: new Map(),
      folderItemIds: new Map(),
    });
  },
}));
