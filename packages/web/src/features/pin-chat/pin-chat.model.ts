/**
 * Pin store — tracks which chats are pinned in each folder.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";

/** Module-level constant for empty pinned list (performance: avoid new [] per call). */
const EMPTY_PINNED: string[] = [];

function pinKey(folderId: string, chatId: string): string {
  return `${folderId}:${chatId}`;
}

interface PinStoreState {
  pinnedKeys: Set<string>;
  folderPins: Map<string, Set<string>>;
  pinOrder: Map<string, string[]>;
  folderItemIds: Map<string, Map<string, string>>;

  pinChat: (
    folderId: string,
    chatId: string,
    options?: { folderItemUuid?: string; orderIndex?: number },
  ) => void;
  unpinChat: (folderId: string, chatId: string) => void;
  isPinned: (folderId: string, chatId: string) => boolean;
  getPinnedChatIds: (folderId: string) => string[];
  getFolderIdsForChat: (chatId: string) => string[];
  getFolderItemUuid: (folderId: string, chatId: string) => string | null;
  reorderPinnedChats: (folderId: string, orderedChatIds: string[]) => void;

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
  pinOrder: new Map(),
  folderItemIds: new Map(),

  pinChat(folderId, chatId, options) {
    logStoreAction("pin", "pinChat", { folderId, chatId });
    set((s) => {
      const key = pinKey(folderId, chatId);
      const nextKeys = new Set(s.pinnedKeys);
      nextKeys.add(key);

      const nextFolder = new Map(s.folderPins);
      const folderSet = new Set(nextFolder.get(folderId) ?? []);
      folderSet.add(chatId);
      nextFolder.set(folderId, folderSet);

      const nextOrder = new Map(s.pinOrder);
      const currentOrder = nextOrder.get(folderId) ?? EMPTY_PINNED;
      const withoutCurrent = currentOrder.filter((id) => id !== chatId);
      const requestedIndex = options?.orderIndex;
      if (
        requestedIndex != null &&
        Number.isInteger(requestedIndex) &&
        requestedIndex >= 0 &&
        requestedIndex <= withoutCurrent.length
      ) {
        withoutCurrent.splice(requestedIndex, 0, chatId);
      } else {
        withoutCurrent.push(chatId);
      }
      nextOrder.set(folderId, withoutCurrent);

      const nextFolderItemIds = new Map(s.folderItemIds);
      if (options?.folderItemUuid) {
        const folderItemMap = new Map(nextFolderItemIds.get(folderId) ?? []);
        folderItemMap.set(chatId, options.folderItemUuid);
        nextFolderItemIds.set(folderId, folderItemMap);
      }

      return {
        pinnedKeys: nextKeys,
        folderPins: nextFolder,
        pinOrder: nextOrder,
        folderItemIds: nextFolderItemIds,
      };
    });
  },

  unpinChat(folderId, chatId) {
    logStoreAction("pin", "unpinChat", { folderId, chatId });
    set((s) => {
      const key = pinKey(folderId, chatId);
      const nextKeys = new Set(s.pinnedKeys);
      nextKeys.delete(key);

      const nextFolder = new Map(s.folderPins);
      const folderSet = new Set(nextFolder.get(folderId) ?? []);
      folderSet.delete(chatId);
      nextFolder.set(folderId, folderSet);

      const nextOrder = new Map(s.pinOrder);
      const currentOrder = nextOrder.get(folderId) ?? [];
      nextOrder.set(
        folderId,
        currentOrder.filter((id) => id !== chatId),
      );

      return { pinnedKeys: nextKeys, folderPins: nextFolder, pinOrder: nextOrder };
    });
  },

  isPinned(folderId, chatId) {
    return get().pinnedKeys.has(pinKey(folderId, chatId));
  },

  getPinnedChatIds(folderId) {
    const folderSet = get().folderPins.get(folderId);
    if (!folderSet || folderSet.size === 0) return EMPTY_PINNED;

    const order = get().pinOrder.get(folderId);
    if (!order || order.length === 0) {
      return Array.from(folderSet);
    }

    const orderedPinned = order.filter((id) => folderSet.has(id));
    const remaining = Array.from(folderSet).filter((id) => !orderedPinned.includes(id));
    return remaining.length > 0 ? [...orderedPinned, ...remaining] : orderedPinned;
  },

  getFolderIdsForChat(chatId) {
    const result: string[] = [];
    for (const [folderId, chatIds] of get().folderPins) {
      if (chatIds.has(chatId)) result.push(folderId);
    }
    return result;
  },

  getFolderItemUuid(folderId, chatId) {
    return get().folderItemIds.get(folderId)?.get(chatId) ?? null;
  },

  reorderPinnedChats(folderId, orderedChatIds) {
    logStoreAction("pin", "reorderPinnedChats", { folderId, count: orderedChatIds.length });
    set((s) => {
      const folderSet = s.folderPins.get(folderId);
      if (!folderSet || folderSet.size === 0) {
        return s;
      }

      const filteredOrdered: string[] = [];
      for (const chatId of orderedChatIds) {
        if (!folderSet.has(chatId) || filteredOrdered.includes(chatId)) {
          continue;
        }
        filteredOrdered.push(chatId);
      }
      const remaining = Array.from(folderSet).filter((chatId) => !filteredOrdered.includes(chatId));

      const nextOrder = new Map(s.pinOrder);
      nextOrder.set(folderId, [...filteredOrdered, ...remaining]);
      return { pinOrder: nextOrder };
    });
  },

  setFromServer(pins) {
    logStoreAction("pin", "setFromServer", { count: pins.length });
    const keys = new Set<string>();
    const folders = new Map<string, Set<string>>();
    const folderItemIds = new Map<string, Map<string, string>>();
    const orderTuples = new Map<string, { chatId: string; orderIndex: number }[]>();

    for (const { folderUuid, folderItemUuid, chatId, orderIndex, pinnedAt } of pins) {
      const folderItemMap = new Map(folderItemIds.get(folderUuid) ?? []);
      folderItemMap.set(chatId, folderItemUuid);
      folderItemIds.set(folderUuid, folderItemMap);

      if (pinnedAt == null) continue;

      keys.add(pinKey(folderUuid, chatId));
      const folderSet = new Set(folders.get(folderUuid) ?? []);
      folderSet.add(chatId);
      folders.set(folderUuid, folderSet);

      const tuples = orderTuples.get(folderUuid) ?? [];
      tuples.push({ chatId, orderIndex });
      orderTuples.set(folderUuid, tuples);
    }

    const pinOrder = new Map<string, string[]>();
    for (const [folderUuid, tuples] of orderTuples) {
      const ordered = [...tuples]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((tuple) => tuple.chatId);
      pinOrder.set(folderUuid, ordered);
    }

    set({ pinnedKeys: keys, folderPins: folders, pinOrder, folderItemIds });
  },

  clear() {
    logStoreAction("pin", "clear", {});
    set({
      pinnedKeys: new Set(),
      folderPins: new Map(),
      pinOrder: new Map(),
      folderItemIds: new Map(),
    });
  },
}));
