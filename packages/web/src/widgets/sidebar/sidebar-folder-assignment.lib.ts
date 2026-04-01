import { addChatToFolder, getFolderItems, getFolders, removeChatFromFolder } from "~/shared/api/workspace-client";
import type { FolderAssignment } from "./sidebar-folder-assignment.types";

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

export async function loadFolderAssignments(
  chatId: string,
  api: FolderAssignmentApi = defaultApi,
): Promise<FolderAssignment[]> {
  const folders = await api.getFolders();
  const assignableFolders = folders.filter((folder) => folder.system_type !== "all");

  const assignments = await Promise.all(
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

  return assignments;
}

export async function toggleFolderAssignment(
  chatId: string,
  assignment: FolderAssignment,
  api: FolderAssignmentApi = defaultApi,
): Promise<{ ok: boolean; nextItemUuid: string | null; removed: boolean }> {
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
