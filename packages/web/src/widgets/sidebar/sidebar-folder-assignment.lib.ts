import {
  SYSTEM_ALL_FOLDER_ID,
  SYSTEM_CHANNELS_FOLDER_ID,
  SYSTEM_PERSONAL_FOLDER_ID,
} from "~/features/folder-sync/folder-sync-constants.lib";
import { useFolderSyncStore } from "~/features/folder-sync/folder-sync.model";
import {
  addChatToFolder,
  getFolderItems,
  getFolders,
  removeChatFromFolder,
  type FolderItemForClient,
  type WorkspaceFolder,
  type WorkspaceFolderForRail,
} from "~/shared/api/workspace-client";
import {
  OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID,
  type FolderAssignment,
} from "./sidebar-folder-assignment.types";

function isAssignableFolder(folder: WorkspaceFolder): folder is WorkspaceFolder & { uuid: string } {
  return (
    folder.system_type !== "all" &&
    typeof folder.uuid === "string" &&
    folder.uuid.trim().length > 0
  );
}

function isAssignableRailFolder(folder: WorkspaceFolderForRail): boolean {
  if (folder.id.trim().length === 0) {
    return false;
  }
  if (folder.id === SYSTEM_ALL_FOLDER_ID) {
    return false;
  }
  if (folder.systemType === "all") {
    return false;
  }
  if (folder.systemType === "personal" || folder.systemType === "channels") {
    return false;
  }
  if (folder.id === SYSTEM_PERSONAL_FOLDER_ID || folder.id === SYSTEM_CHANNELS_FOLDER_ID) {
    return false;
  }
  return true;
}

export type { FolderAssignment };

interface FolderAssignmentApi {
  getFolders: typeof getFolders;
  getFolderItems: typeof getFolderItems;
  addChatToFolder: typeof addChatToFolder;
  removeChatFromFolder: typeof removeChatFromFolder;
}

const defaultApi: FolderAssignmentApi = {
  getFolders,
  getFolderItems,
  addChatToFolder,
  removeChatFromFolder,
};

function parseStreamChatId(chatId: string): { streamId: string; topic: string | null } | null {
  const [kind, streamId, ...topicParts] = chatId.split(":");
  if (kind !== "stream" || streamId == null || streamId.length === 0) {
    return null;
  }
  const topic = topicParts.length > 0 ? topicParts.join(":") : null;
  return { streamId, topic };
}

function normalizeStreamTopic(topic: string | null): string {
  if (topic == null) return "general";
  const trimmedTopic = topic.trim();
  if (trimmedTopic.length === 0) return "general";
  if (trimmedTopic.toLowerCase() === "general") return "general";
  return trimmedTopic;
}

function parseNumericChatId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseSingleDmUserId(chatId: string): number | null {
  const dmMatch = /^dm:([0-9]+)$/.exec(chatId);
  if (!dmMatch?.[1]) {
    return null;
  }
  const parsed = Number(dmMatch[1]);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function areEquivalentChatIds(leftChatId: string, rightChatId: string): boolean {
  if (leftChatId === rightChatId) {
    return true;
  }

  const leftNumeric = parseNumericChatId(leftChatId);
  const rightNumeric = parseNumericChatId(rightChatId);
  if (leftNumeric != null && rightNumeric != null) {
    return leftNumeric === rightNumeric;
  }

  const leftStream = parseStreamChatId(leftChatId);
  const rightStream = parseStreamChatId(rightChatId);
  if (leftStream != null && rightStream != null) {
    if (leftStream.streamId !== rightStream.streamId) {
      return false;
    }
    return normalizeStreamTopic(leftStream.topic) === normalizeStreamTopic(rightStream.topic);
  }

  if (leftNumeric != null && rightStream != null) {
    return leftNumeric === Number(rightStream.streamId);
  }
  if (rightNumeric != null && leftStream != null) {
    return rightNumeric === Number(leftStream.streamId);
  }

  const leftSingleDm = parseSingleDmUserId(leftChatId);
  const rightSingleDm = parseSingleDmUserId(rightChatId);
  if (leftNumeric != null && rightSingleDm != null) {
    return leftNumeric === rightSingleDm;
  }
  if (rightNumeric != null && leftSingleDm != null) {
    return rightNumeric === leftSingleDm;
  }

  return false;
}

async function loadFolderAssignmentsFromWorkspaceApi(
  chatId: string,
  api: FolderAssignmentApi,
): Promise<FolderAssignment[]> {
  const folders = await api.getFolders();
  const assignableFolders = folders.filter(isAssignableFolder);

  return Promise.all(
    assignableFolders.map(async (folder) => {
      try {
        const items = await api.getFolderItems(folder.uuid);
        const assignment = items.find((item) => areEquivalentChatIds(item.chatId, chatId));
        return {
          folderUuid: folder.uuid,
          label: folder.title,
          itemUuid: assignment?.uuid ?? null,
        } satisfies FolderAssignment;
      } catch {
        return {
          folderUuid: folder.uuid,
          label: folder.title,
          itemUuid: null,
        } satisfies FolderAssignment;
      }
    }),
  );
}

export async function loadFolderAssignments(
  chatId: string,
  api: FolderAssignmentApi = defaultApi,
): Promise<FolderAssignment[]> {
  const sync = useFolderSyncStore.getState();
  if (sync.instanceId == null || sync.folders.length === 0) {
    return loadFolderAssignmentsFromWorkspaceApi(chatId, api);
  }

  const assignableRailFolders = sync.folders.filter(isAssignableRailFolder);
  if (assignableRailFolders.length === 0) {
    return [];
  }

  const { folderItemsByFolderId } = sync;

  return Promise.all(
    assignableRailFolders.map(async (folder) => {
      const folderId = folder.id;
      try {
        let items: FolderItemForClient[];
        if (folderItemsByFolderId.has(folderId)) {
          items = folderItemsByFolderId.get(folderId) ?? [];
        } else {
          items = await api.getFolderItems(folderId);
        }
        const assignment = items.find((item) => areEquivalentChatIds(item.chatId, chatId));
        return {
          folderUuid: folderId,
          label: folder.label,
          itemUuid: assignment?.uuid ?? null,
        } satisfies FolderAssignment;
      } catch {
        return {
          folderUuid: folderId,
          label: folder.label,
          itemUuid: null,
        } satisfies FolderAssignment;
      }
    }),
  );
}

export async function toggleFolderAssignment(
  chatId: string,
  assignment: FolderAssignment,
  api: FolderAssignmentApi = defaultApi,
): Promise<{ ok: boolean; nextItemUuid: string | null; removed: boolean }> {
  if (assignment.itemUuid === OPTIMISTIC_FOLDER_ASSIGNMENT_ITEM_UUID) {
    return { ok: false, nextItemUuid: null, removed: false };
  }
  if (assignment.itemUuid != null) {
    const ok = await api.removeChatFromFolder(assignment.folderUuid, assignment.itemUuid);
    return {
      ok,
      nextItemUuid: ok ? null : assignment.itemUuid,
      removed: ok,
    };
  }

  const ok = await api.addChatToFolder(assignment.folderUuid, chatId);
  if (!ok) {
    return { ok: false, nextItemUuid: null, removed: false };
  }

  try {
    const items = await api.getFolderItems(assignment.folderUuid);
    const itemUuid = items.find((item) => areEquivalentChatIds(item.chatId, chatId))?.uuid ?? null;
    return { ok: true, nextItemUuid: itemUuid, removed: false };
  } catch {
    return { ok: true, nextItemUuid: null, removed: false };
  }
}
