/**
 * Mail store — folders, message list, preview, and session lifecycle.
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  clearMailSessionFromStorage,
  loadMailSessionFromStorage,
  saveMailSessionToStorage,
} from "./mail-session-storage.lib";
import {
  clearMailFolder,
  createMailFolder,
  createMailSession,
  deleteMailFolder,
  deleteMailMessage,
  deleteMailSession,
  fetchMailFolders,
  fetchMailMessage,
  fetchMailMessages,
  fetchMailMessageAttachments,
  markAllMailFolderRead,
  moveMailFolder,
  moveMailMessage,
  patchMailMessageFlags,
  renameMailFolder,
  searchMailMessages,
  sendMailMessage,
  createMailDraft,
  updateMailDraft,
  sendMailDraft,
  batchMailMessages,
} from "./mail.api";
import { isTrashFolder, resolveSpecialFolderPath, selectAdjacentMessageUid } from "./mail.lib";
import { invalidateMailSessionIfUnauthorized, resolveMailActionError } from "./mail.model.lib";
import type {
  MailAttachmentMeta,
  MailBatchAction,
  MailComposePayload,
  MailCreateFolderInput,
  MailFlagsPatch,
  MailFolder,
  MailMessageDetail,
  MailMessageSummary,
  MailMoveFolderInput,
  MailRenameFolderInput,
  MailSessionInfo,
} from "./mail.types";

interface MailState {
  session: MailSessionInfo | null;
  folders: MailFolder[];
  folderDelimiter: string;
  messages: MailMessageSummary[];
  messagesNextCursor: string | null;
  loadingMoreMessages: boolean;
  searchQuery: string;
  searchResults: MailMessageSummary[] | null;
  messageAttachments: MailAttachmentMeta[];
  selectedFolder: string;
  selectedUid: number | null;
  selectedMessage: MailMessageDetail | null;
  loadingFolders: boolean;
  loadingMessages: boolean;
  loadingMessage: boolean;
  sending: boolean;
  signingIn: boolean;
  error: string | null;

  hydrateSession: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadFolders: () => Promise<void>;
  selectFolder: (folderPath: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  searchMessages: (query: string) => Promise<void>;
  clearSearch: () => void;
  loadMessageAttachments: (uid: number) => Promise<void>;
  saveDraft: (payload: MailComposePayload, uid?: number) => Promise<void>;
  sendDraft: (uid: number) => Promise<void>;
  batchMessages: (
    uids: number[],
    action: MailBatchAction,
    options?: { toFolder?: string; addFlags?: string[]; removeFlags?: string[] },
  ) => Promise<void>;
  selectMessage: (uid: number, options?: { markSeen?: boolean }) => Promise<void>;
  sendMessage: (payload: MailComposePayload) => Promise<void>;
  deleteMessage: (uid: number) => Promise<void>;
  moveMessage: (uid: number, toFolder: string) => Promise<void>;
  setMessageFlags: (uid: number, patch: MailFlagsPatch) => Promise<void>;
  createFolder: (input: MailCreateFolderInput) => Promise<string>;
  renameFolder: (input: MailRenameFolderInput) => Promise<string>;
  moveFolder: (input: MailMoveFolderInput) => Promise<string>;
  deleteFolder: (path: string) => Promise<void>;
  clearFolder: (path: string) => Promise<void>;
  markFolderAllRead: (path: string) => Promise<void>;
  clear: () => void;
}

function applyFlagsToSummary(
  message: MailMessageSummary,
  patch: MailFlagsPatch,
): MailMessageSummary {
  let seen = message.seen;
  let flagged = message.flagged;
  if (patch.addFlags?.includes("\\Seen")) seen = true;
  if (patch.removeFlags?.includes("\\Seen")) seen = false;
  if (patch.addFlags?.includes("\\Flagged")) flagged = true;
  if (patch.removeFlags?.includes("\\Flagged")) flagged = false;
  return { ...message, seen, flagged };
}

export const useMailStore = create<MailState>((set, get) => {
  function invalidateSessionIfUnauthorized(error: unknown): boolean {
    const invalidated = invalidateMailSessionIfUnauthorized(error, {
      resetMailData: () => {
        set({
          session: null,
          folders: [],
          messages: [],
          selectedUid: null,
          selectedMessage: null,
          loadingFolders: false,
          loadingMessages: false,
          loadingMessage: false,
          sending: false,
          signingIn: false,
        });
      },
    });
    if (invalidated) {
      logStoreAction("mail", "invalidateSession", { reason: "unauthorized" });
    }
    return invalidated;
  }

  async function refreshAfterMessageRemoved(uid: number): Promise<void> {
    const messages = get().messages.filter((message) => message.uid !== uid);
    const nextUid = selectAdjacentMessageUid(get().messages, uid);
    set({
      messages,
      selectedUid: nextUid,
      selectedMessage: null,
      loadingMessage: nextUid != null,
    });
    if (nextUid != null) {
      await get().selectMessage(nextUid);
    }
    await get().loadFolders();
  }

  return {
    session: null,
    folders: [],
    folderDelimiter: ".",
    messages: [],
    messagesNextCursor: null,
    loadingMoreMessages: false,
    searchQuery: "",
    searchResults: null,
    messageAttachments: [],
    selectedFolder: "INBOX",
    selectedUid: null,
    selectedMessage: null,
    loadingFolders: false,
    loadingMessages: false,
    loadingMessage: false,
    sending: false,
    signingIn: false,
    error: null,

    hydrateSession() {
      const stored = loadMailSessionFromStorage();
      if (stored) {
        logStoreAction("mail", "hydrateSession", { email: stored.email });
        set({ session: stored, error: null });
      }
    },

    async signIn(email, password) {
      logStoreAction("mail", "signIn", { email });
      set({ signingIn: true, error: null });
      try {
        const session = await createMailSession(email, password);
        saveMailSessionToStorage(session);
        set({ session, signingIn: false, error: null });
        await get().loadFolders();
        await get().selectFolder("INBOX");
      } catch (error) {
        set({
          signingIn: false,
          error: resolveMailActionError(error, "mail.errors.signIn"),
        });
        throw error;
      }
    },

    async signOut() {
      const token = get().session?.token;
      logStoreAction("mail", "signOut");
      if (token) {
        try {
          await deleteMailSession(token);
        } catch {
          /* best-effort server logout */
        }
      }
      clearMailSessionFromStorage();
      get().clear();
    },

    async loadFolders() {
      const token = get().session?.token;
      if (!token) return;
      set({ loadingFolders: true, error: null });
      try {
        const { folders, delimiter } = await fetchMailFolders(token);
        set({ folders, folderDelimiter: delimiter, loadingFolders: false });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          loadingFolders: false,
          error: resolveMailActionError(error, "mail.errors.loadFolders"),
        });
      }
    },

    async selectFolder(folderPath) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "selectFolder", { folder: folderPath });
      set({
        selectedFolder: folderPath,
        selectedUid: null,
        selectedMessage: null,
        loadingMessages: true,
        error: null,
      });
      try {
        const { messages, nextCursor } = await fetchMailMessages(token, folderPath);
        set({
          messages,
          messagesNextCursor: nextCursor,
          loadingMessages: false,
          searchResults: null,
          searchQuery: "",
        });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          loadingMessages: false,
          error: resolveMailActionError(error, "mail.errors.loadMessages"),
        });
      }
    },

    async loadMoreMessages() {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      const cursor = get().messagesNextCursor;
      if (!token || cursor == null) return;
      set({ loadingMoreMessages: true, error: null });
      try {
        const { messages, nextCursor } = await fetchMailMessages(token, folder, 50, cursor);
        set({
          messages: [...get().messages, ...messages],
          messagesNextCursor: nextCursor,
          loadingMoreMessages: false,
        });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          loadingMoreMessages: false,
          error: resolveMailActionError(error, "mail.errors.loadMessages"),
        });
      }
    },

    async searchMessages(query) {
      const token = get().session?.token;
      if (!token) return;
      const trimmed = query.trim();
      set({ searchQuery: trimmed, loadingMessages: true, error: null });
      if (trimmed.length === 0) {
        set({ searchResults: null, loadingMessages: false });
        await get().selectFolder(get().selectedFolder);
        return;
      }
      try {
        const { messages, nextCursor } = await searchMailMessages(
          token,
          trimmed,
          get().selectedFolder,
        );
        set({
          searchResults: messages,
          messagesNextCursor: nextCursor,
          loadingMessages: false,
        });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          loadingMessages: false,
          error: resolveMailActionError(error, "mail.errors.loadMessages"),
        });
      }
    },

    clearSearch() {
      set({ searchQuery: "", searchResults: null });
    },

    async loadMessageAttachments(uid) {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      if (!token) return;
      try {
        const attachments = await fetchMailMessageAttachments(token, folder, uid);
        set({ messageAttachments: attachments });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({ messageAttachments: [] });
      }
    },

    async saveDraft(payload, uid) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "saveDraft", { uid });
      set({ sending: true, error: null });
      try {
        if (uid != null) {
          await updateMailDraft(token, uid, payload);
        } else {
          await createMailDraft(token, payload);
        }
        set({ sending: false });
        await get().loadFolders();
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          sending: false,
          error: resolveMailActionError(error, "mail.errors.sendMessage"),
        });
        throw error;
      }
    },

    async sendDraft(uid) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "sendDraft", { uid });
      set({ sending: true, error: null });
      try {
        await sendMailDraft(token, uid);
        set({ sending: false });
        await get().selectFolder(get().selectedFolder);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          sending: false,
          error: resolveMailActionError(error, "mail.errors.sendMessage"),
        });
        throw error;
      }
    },

    async batchMessages(uids, action, options = {}) {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      if (!token || uids.length === 0) return;
      logStoreAction("mail", "batchMessages", { action, count: uids.length });
      set({ error: null });
      try {
        await batchMailMessages(token, folder, uids, action, options);
        await get().selectFolder(folder);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({ error: resolveMailActionError(error, "mail.errors.moveMessage") });
        throw error;
      }
    },

    async selectMessage(uid, options = {}) {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      if (!token) return;
      const markSeen = options.markSeen !== false;
      logStoreAction("mail", "selectMessage", { uid, folder, markSeen });
      const wasUnread = get().messages.some((message) => message.uid === uid && !message.seen);
      set({ selectedUid: uid, loadingMessage: true, error: null });
      try {
        const message = await fetchMailMessage(token, folder, uid, { markSeen });
        const messages = get().messages.map((item) =>
          item.uid === uid
            ? applyFlagsToSummary(item, {
                ...(markSeen ? { addFlags: ["\\Seen"] } : {}),
              })
            : item,
        );
        const folders =
          markSeen && wasUnread
            ? get().folders.map((item) =>
                item.path === folder ? { ...item, unread: Math.max(0, item.unread - 1) } : item,
              )
            : get().folders;
        set({
          selectedMessage: markSeen ? { ...message, seen: true } : message,
          loadingMessage: false,
          messages,
          folders,
          messageAttachments: [],
        });
        await get().loadMessageAttachments(uid);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          loadingMessage: false,
          error: resolveMailActionError(error, "mail.errors.loadMessage"),
        });
      }
    },

    async sendMessage(payload) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "sendMessage", { to: payload.to });
      set({ sending: true, error: null });
      try {
        await sendMailMessage(token, payload);
        set({ sending: false });
        await get().selectFolder(get().selectedFolder);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          sending: false,
          error: resolveMailActionError(error, "mail.errors.sendMessage"),
        });
        throw error;
      }
    },

    async deleteMessage(uid) {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      if (!token) return;
      logStoreAction("mail", "deleteMessage", { uid, folder });
      set({ error: null });
      try {
        await deleteMailMessage(token, folder, uid);
        await refreshAfterMessageRemoved(uid);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.deleteMessage"),
        });
        throw error;
      }
    },

    async moveMessage(uid, toFolder) {
      const token = get().session?.token;
      const fromFolder = get().selectedFolder;
      if (!token) return;
      logStoreAction("mail", "moveMessage", { uid, fromFolder, toFolder });
      set({ error: null });
      try {
        await moveMailMessage(token, fromFolder, toFolder, uid);
        await refreshAfterMessageRemoved(uid);
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.moveMessage"),
        });
        throw error;
      }
    },

    async setMessageFlags(uid, patch) {
      const token = get().session?.token;
      const folder = get().selectedFolder;
      if (!token) return;
      logStoreAction("mail", "setMessageFlags", { uid, folder, patch });
      set({ error: null });
      try {
        await patchMailMessageFlags(token, folder, uid, patch);
        const messages = get().messages.map((item) =>
          item.uid === uid ? applyFlagsToSummary(item, patch) : item,
        );
        const currentDetail = get().selectedMessage;
        const selectedMessage =
          get().selectedUid === uid && currentDetail != null
            ? { ...currentDetail, ...applyFlagsToSummary(currentDetail, patch) }
            : currentDetail;
        let folders = get().folders;
        if (patch.addFlags?.includes("\\Seen") || patch.removeFlags?.includes("\\Seen")) {
          const wasUnread = get().messages.some((message) => message.uid === uid && !message.seen);
          const nowUnread = patch.removeFlags?.includes("\\Seen") === true;
          const nowRead = patch.addFlags?.includes("\\Seen") === true;
          if (wasUnread && nowRead) {
            folders = folders.map((item) =>
              item.path === folder ? { ...item, unread: Math.max(0, item.unread - 1) } : item,
            );
          } else if (!wasUnread && nowUnread) {
            folders = folders.map((item) =>
              item.path === folder ? { ...item, unread: item.unread + 1 } : item,
            );
          }
        }
        set({ messages, selectedMessage, folders });
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.updateFlags"),
        });
        throw error;
      }
    },

    async createFolder(input) {
      const token = get().session?.token;
      if (!token) return "";
      logStoreAction("mail", "createFolder", { name: input.name, parentPath: input.parentPath });
      set({ error: null });
      try {
        const path = await createMailFolder(token, input, get().folderDelimiter);
        await get().loadFolders();
        return path;
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.createFolder"),
        });
        throw error;
      }
    },

    async renameFolder(input) {
      const token = get().session?.token;
      if (!token) return "";
      logStoreAction("mail", "renameFolder", { path: input.path, name: input.name });
      set({ error: null });
      try {
        const path = await renameMailFolder(token, input, get().folderDelimiter);
        await get().loadFolders();
        if (get().selectedFolder === input.path) {
          await get().selectFolder(path);
        }
        return path;
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.renameFolder"),
        });
        throw error;
      }
    },

    async moveFolder(input) {
      const token = get().session?.token;
      if (!token) return "";
      logStoreAction("mail", "moveFolder", { path: input.path, parentPath: input.parentPath });
      set({ error: null });
      try {
        const path = await moveMailFolder(token, input, get().folderDelimiter);
        await get().loadFolders();
        if (get().selectedFolder === input.path) {
          await get().selectFolder(path);
        }
        return path;
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.moveFolder"),
        });
        throw error;
      }
    },

    async deleteFolder(path) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "deleteFolder", { path });
      set({ error: null });
      try {
        await deleteMailFolder(token, path, get().folderDelimiter);
        await get().loadFolders();
        if (get().selectedFolder === path) {
          await get().selectFolder("INBOX");
        }
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.deleteFolder"),
        });
        throw error;
      }
    },

    async clearFolder(path) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "clearFolder", { path });
      set({ error: null });
      try {
        await clearMailFolder(token, path);
        await get().loadFolders();
        if (get().selectedFolder === path) {
          await get().selectFolder(path);
        }
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.clearFolder"),
        });
        throw error;
      }
    },

    async markFolderAllRead(path) {
      const token = get().session?.token;
      if (!token) return;
      logStoreAction("mail", "markFolderAllRead", { path });
      set({ error: null });
      try {
        await markAllMailFolderRead(token, path);
        await get().loadFolders();
        if (get().selectedFolder === path) {
          await get().selectFolder(path);
        }
      } catch (error) {
        invalidateSessionIfUnauthorized(error);
        set({
          error: resolveMailActionError(error, "mail.errors.markAllRead"),
        });
        throw error;
      }
    },

    clear() {
      logStoreAction("mail", "clear");
      set({
        session: null,
        folders: [],
        folderDelimiter: ".",
        messages: [],
        messagesNextCursor: null,
        loadingMoreMessages: false,
        searchQuery: "",
        searchResults: null,
        messageAttachments: [],
        selectedFolder: "INBOX",
        selectedUid: null,
        selectedMessage: null,
        loadingFolders: false,
        loadingMessages: false,
        loadingMessage: false,
        sending: false,
        signingIn: false,
        error: null,
      });
    },
  };
});

/** Clears mail session — call from auth logout wiper. */
export function clearMailSessionOnLogout(): void {
  clearMailSessionFromStorage();
  useMailStore.getState().clear();
}

export { isTrashFolder, resolveSpecialFolderPath };
