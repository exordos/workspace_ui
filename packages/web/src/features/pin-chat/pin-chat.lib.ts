import { isPersistedFolderItemUuid } from "~/features/folder-sync/folder-sync-assignment.lib";
import {
  areEquivalentChatIds,
  resolveFolderItemUuid,
} from "~/features/folder-sync/folder-sync-chat-id.lib";
import { SYSTEM_ALL_FOLDER_ID } from "~/features/folder-sync/folder-sync-constants.lib";
import {
  resolveFolderItemsRequestUuid,
  resolvePinScopeFolderUuid,
} from "~/features/folder-sync/folder-sync.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import { pinChatInFolder, unpinChatInFolder } from "~/features/pin-chat/pin-chat.api";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import {
  addChatToFolder,
  getFolders,
  mapWorkspaceFolderItems,
} from "~/shared/api/workspace-client";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("pin:toggle");

export { resolvePinScopeFolderUuid };

interface PinActionTarget {
  folderUuid: string;
  folderItemUuid: string;
}

function isAllFolderPinContext(
  apiFolderUuid: string,
  scopeFolderId: string | null | undefined,
  allFolderApiUuid: string | null,
): boolean {
  const scope = scopeFolderId?.trim();
  if (scope === SYSTEM_ALL_FOLDER_ID || scope === "all") {
    return true;
  }
  const api = apiFolderUuid.trim();
  const allApi = allFolderApiUuid?.trim();
  return allApi != null && allApi.length > 0 && api === allApi;
}

/** Cache/pin-store keys for the active folder only (no cross-folder «all» leakage). */
function folderLookupKeys(
  apiFolderUuid: string,
  scopeFolderId: string | null | undefined,
  allFolderApiUuid: string | null,
): string[] {
  const keys = new Set<string>();
  const api = apiFolderUuid.trim();
  if (api.length > 0) {
    keys.add(api);
  }
  const scope = scopeFolderId?.trim();
  if (scope != null && scope.length > 0 && scope !== api) {
    keys.add(scope);
  }
  if (isAllFolderPinContext(api, scopeFolderId, allFolderApiUuid)) {
    keys.add(SYSTEM_ALL_FOLDER_ID);
    keys.add("all");
  }
  return [...keys];
}

function normalizePinTarget(
  target: PinActionTarget,
  apiFolderUuid: string,
  allFolderApiUuid: string | null,
): PinActionTarget {
  return {
    folderUuid: resolveFolderItemsRequestUuid(target.folderUuid, allFolderApiUuid) ?? apiFolderUuid,
    folderItemUuid: target.folderItemUuid,
  };
}

function findPinnedItemInCache(
  lookupKeys: readonly string[],
  chatId: string,
): PinActionTarget | null {
  for (const folderKey of lookupKeys) {
    const items = useFolderSyncStore.getState().folderItemsByFolderId.get(folderKey) ?? [];
    for (const item of items) {
      if (
        item.pinnedAt != null &&
        areEquivalentChatIds(item.chatId, chatId) &&
        isPersistedFolderItemUuid(item.uuid)
      ) {
        return { folderUuid: folderKey, folderItemUuid: item.uuid };
      }
    }
  }
  return null;
}

function resolveFolderItemFromCache(
  lookupKeys: readonly string[],
  chatId: string,
  preferPinnedItem: boolean,
): PinActionTarget | null {
  const pinStore = usePinStore.getState();
  for (const folderKey of lookupKeys) {
    const folderItemUuid = pinStore.getFolderItemUuid(folderKey, chatId);
    if (folderItemUuid != null && isPersistedFolderItemUuid(folderItemUuid)) {
      return { folderUuid: folderKey, folderItemUuid };
    }
  }

  if (preferPinnedItem) {
    const pinned = findPinnedItemInCache(lookupKeys, chatId);
    if (pinned != null) {
      return pinned;
    }
  }

  for (const folderKey of lookupKeys) {
    const items = useFolderSyncStore.getState().folderItemsByFolderId.get(folderKey) ?? [];
    const folderItemUuid = resolveFolderItemUuid(items, chatId);
    if (folderItemUuid != null && isPersistedFolderItemUuid(folderItemUuid)) {
      return { folderUuid: folderKey, folderItemUuid };
    }
  }

  return null;
}

async function resolvePinActionTarget(options: {
  apiFolderUuid: string;
  scopeFolderId?: string | null;
  chatId: string;
  preferPinnedItem: boolean;
  folderItemUuid?: string | null;
}): Promise<PinActionTarget | null> {
  const allFolderApiUuid = useFolderSyncStore.getState().allFolderApiUuid;
  const lookupKeys = folderLookupKeys(
    options.apiFolderUuid,
    options.scopeFolderId,
    allFolderApiUuid,
  );
  const explicitUuid = options.folderItemUuid?.trim();

  if (explicitUuid != null && explicitUuid.length > 0 && isPersistedFolderItemUuid(explicitUuid)) {
    return normalizePinTarget(
      { folderUuid: options.apiFolderUuid, folderItemUuid: explicitUuid },
      options.apiFolderUuid,
      allFolderApiUuid,
    );
  }

  const fromCache = resolveFolderItemFromCache(
    lookupKeys,
    options.chatId,
    options.preferPinnedItem,
  );
  if (fromCache != null) {
    return normalizePinTarget(fromCache, options.apiFolderUuid, allFolderApiUuid);
  }

  const fetchUuid =
    resolveFolderItemsRequestUuid(options.apiFolderUuid, allFolderApiUuid) ?? options.apiFolderUuid;

  try {
    const folders = await getFolders();
    const items = (() => {
      const folder = folders.find((f) => f.uuid === fetchUuid);
      return folder ? mapWorkspaceFolderItems(folder) : [];
    })();

    if (options.preferPinnedItem) {
      for (const item of items) {
        if (
          item.pinnedAt != null &&
          areEquivalentChatIds(item.chatId, options.chatId) &&
          isPersistedFolderItemUuid(item.uuid)
        ) {
          return normalizePinTarget(
            { folderUuid: fetchUuid, folderItemUuid: item.uuid },
            options.apiFolderUuid,
            allFolderApiUuid,
          );
        }
      }
    }

    const folderItemUuid = resolveFolderItemUuid(items, options.chatId);
    if (folderItemUuid != null && isPersistedFolderItemUuid(folderItemUuid)) {
      return normalizePinTarget(
        { folderUuid: fetchUuid, folderItemUuid },
        options.apiFolderUuid,
        allFolderApiUuid,
      );
    }
  } catch (err) {
    log.warn("resolvePinActionTarget:getFolders failed", {
      folderUuid: fetchUuid,
      error: String(err),
    });
  }

  return null;
}

async function ensureFolderItemForPin(
  apiFolderUuid: string,
  chatId: string,
  scopeFolderId?: string | null,
): Promise<PinActionTarget | null> {
  const added = await addChatToFolder(apiFolderUuid, chatId);
  if (!added) {
    log.warn("ensureFolderItemForPin:addChatToFolder failed", { apiFolderUuid, chatId });
    return null;
  }

  await useFolderSyncStore.getState().refreshFolderItemsCache(apiFolderUuid);

  const allFolderApiUuid = useFolderSyncStore.getState().allFolderApiUuid;
  const fromCache = resolveFolderItemFromCache(
    folderLookupKeys(apiFolderUuid, scopeFolderId, allFolderApiUuid),
    chatId,
    false,
  );
  return fromCache != null ? normalizePinTarget(fromCache, apiFolderUuid, allFolderApiUuid) : null;
}

/** Synchronous best-effort folder item UUID for context menu handlers (before async toggle). */
export function resolveFolderItemUuidForMenu(options: {
  apiFolderUuid: string;
  scopeFolderId?: string | null;
  chatId: string;
  preferPinnedItem: boolean;
}): string | null {
  const allFolderApiUuid = useFolderSyncStore.getState().allFolderApiUuid;
  const target = resolveFolderItemFromCache(
    folderLookupKeys(options.apiFolderUuid, options.scopeFolderId, allFolderApiUuid),
    options.chatId,
    options.preferPinnedItem,
  );
  return target?.folderItemUuid ?? null;
}

function clearLocalPinState(
  apiFolderUuid: string,
  scopeFolderId: string | undefined,
  chatId: string,
  allFolderApiUuid: string | null,
): void {
  const pinStore = usePinStore.getState();
  for (const folderKey of folderLookupKeys(apiFolderUuid, scopeFolderId, allFolderApiUuid)) {
    if (pinStore.isPinned(folderKey, chatId)) {
      pinStore.unpinChat(folderKey, chatId);
    }
  }
}

/** Resolves folder item UUID and runs pin or unpin against Workspace API + local stores. */
export async function runFolderPinToggle(options: {
  apiFolderUuid?: string;
  scopeFolderId?: string;
  chatId: string;
  isPinned: boolean;
  allFolderApiUuid?: string | null;
  folderItemUuid?: string | null;
}): Promise<void> {
  const allFolderApiUuid =
    options.allFolderApiUuid ?? useFolderSyncStore.getState().allFolderApiUuid;

  const apiFolderUuid =
    options.apiFolderUuid?.trim() ??
    (options.scopeFolderId != null
      ? resolvePinScopeFolderUuid(options.scopeFolderId, allFolderApiUuid)
      : null);

  if (apiFolderUuid == null || apiFolderUuid.length === 0) {
    log.warn(`runFolderPinToggle:${options.isPinned ? "unpin" : "pin"}:skipped — no folder uuid`, {
      scopeFolderId: options.scopeFolderId,
      chatId: options.chatId,
    });
    return;
  }

  let target: PinActionTarget | null;
  try {
    target = await resolvePinActionTarget({
      apiFolderUuid,
      scopeFolderId: options.scopeFolderId,
      chatId: options.chatId,
      preferPinnedItem: options.isPinned,
      folderItemUuid: options.folderItemUuid,
    });
  } catch (err) {
    log.error("runFolderPinToggle:resolve failed", { apiFolderUuid, error: String(err) });
    return;
  }

  if (target == null && !options.isPinned) {
    target = await ensureFolderItemForPin(apiFolderUuid, options.chatId, options.scopeFolderId);
  }

  if (target == null) {
    log.warn(`runFolderPinToggle:${options.isPinned ? "unpin" : "pin"}:skipped — no folder item`, {
      apiFolderUuid,
      scopeFolderId: options.scopeFolderId,
      chatId: options.chatId,
    });
    return;
  }

  const { folderItemUuid } = target;
  const folderSync = useFolderSyncStore.getState();
  const pinStore = usePinStore.getState();

  if (options.isPinned) {
    if (!(await unpinChatInFolder(apiFolderUuid, folderItemUuid))) {
      return;
    }
    clearLocalPinState(apiFolderUuid, options.scopeFolderId, options.chatId, allFolderApiUuid);
    folderSync.patchFolderItemPinnedAt(apiFolderUuid, folderItemUuid, null);
    void folderSync.refreshFolderItemsCache(apiFolderUuid);
    return;
  }

  if (!(await pinChatInFolder(apiFolderUuid, folderItemUuid))) {
    return;
  }

  const pinnedAt = new Date().toISOString();
  pinStore.pinChat(apiFolderUuid, options.chatId, { folderItemUuid, pinnedAt });
  folderSync.patchFolderItemPinnedAt(apiFolderUuid, folderItemUuid, pinnedAt);
  void folderSync.refreshFolderItemsCache(apiFolderUuid);
}
