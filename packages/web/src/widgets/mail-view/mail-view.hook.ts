import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildForwardComposeState,
  buildNewComposeState,
  buildReplyComposeState,
  buildDraftComposeState,
} from "~/entities/mail/mail-compose.lib";
import { downloadMailMessageAttachment } from "~/entities/mail/mail.api";
import {
  isTrashFolder,
  isDraftsFolder,
  resolveSpecialFolderPath,
  sortMailFolders,
  sortMailMessagesByUidDesc,
} from "~/entities/mail/mail.lib";
import { useMailStore } from "~/entities/mail/mail.model";
import type {
  MailComposeInitialState,
  MailComposeMode,
  MailComposePayload,
  MailCreateFolderInput,
  MailFolderAction,
  MailMessageAction,
} from "~/entities/mail/mail.types";
import { onTabResume } from "~/shared/lib/visibility";
import { useFolderDialogAction, useFolderDialogSubmitAction } from "./mail-view-folder-dialog.hook";

export function useMailView() {
  const session = useMailStore((s) => s.session);
  const sending = useMailStore((s) => s.sending);
  const error = useMailStore((s) => s.error);
  const selectedFolder = useMailStore((s) => s.selectedFolder);
  const selectedUid = useMailStore((s) => s.selectedUid);
  const selectedMessage = useMailStore((s) => s.selectedMessage);
  const loadingMessages = useMailStore((s) => s.loadingMessages);
  const loadingMessage = useMailStore((s) => s.loadingMessage);
  const foldersRaw = useMailStore((s) => s.folders);
  const folderDelimiter = useMailStore((s) => s.folderDelimiter);
  const messagesRaw = useMailStore((s) => s.messages);
  const searchResults = useMailStore((s) => s.searchResults);
  const messagesNextCursor = useMailStore((s) => s.messagesNextCursor);
  const loadingMoreMessages = useMailStore((s) => s.loadingMoreMessages);
  const messageAttachments = useMailStore((s) => s.messageAttachments);
  const searchMessages = useMailStore((s) => s.searchMessages);
  const loadMoreMessages = useMailStore((s) => s.loadMoreMessages);
  const clearSearch = useMailStore((s) => s.clearSearch);
  const selectFolder = useMailStore((s) => s.selectFolder);
  const selectMessage = useMailStore((s) => s.selectMessage);
  const sendMessage = useMailStore((s) => s.sendMessage);
  const saveDraft = useMailStore((s) => s.saveDraft);
  const sendDraft = useMailStore((s) => s.sendDraft);
  const batchMessages = useMailStore((s) => s.batchMessages);
  const deleteMessage = useMailStore((s) => s.deleteMessage);
  const moveMessage = useMailStore((s) => s.moveMessage);
  const setMessageFlags = useMailStore((s) => s.setMessageFlags);
  const createFolder = useMailStore((s) => s.createFolder);
  const renameFolder = useMailStore((s) => s.renameFolder);
  const moveFolder = useMailStore((s) => s.moveFolder);
  const deleteFolder = useMailStore((s) => s.deleteFolder);
  const clearFolder = useMailStore((s) => s.clearFolder);
  const markFolderAllRead = useMailStore((s) => s.markFolderAllRead);
  const loadFolders = useMailStore((s) => s.loadFolders);
  const syncCurrentFolder = useMailStore((s) => s.syncCurrentFolder);
  const deleteDraft = useMailStore((s) => s.deleteDraft);

  type FolderDialogKind = "rename" | "move" | "delete" | "clear";

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<MailComposeMode>("new");
  const [composeInitial, setComposeInitial] = useState<MailComposeInitialState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [foldersCompact, setFoldersCompact] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reopenMoveAfterCreateFolder, setReopenMoveAfterCreateFolder] = useState(false);
  const [createFolderParent, setCreateFolderParent] = useState("");
  const [folderActionPath, setFolderActionPath] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogKind | null>(null);
  const [folderActionPending, setFolderActionPending] = useState(false);
  const [composeDraftUid, setComposeDraftUid] = useState<string | null>(null);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [narrowPreviewOpen, setNarrowPreviewOpen] = useState(false);

  const folders = useMemo(() => sortMailFolders(foldersRaw), [foldersRaw]);
  const folderActionTarget = useMemo(
    () => folders.find((folder) => folder.path === folderActionPath) ?? null,
    [folderActionPath, folders],
  );
  const messages = useMemo(
    () => sortMailMessagesByUidDesc(searchResults ?? messagesRaw),
    [messagesRaw, searchResults],
  );
  const inTrash = useMemo(() => isTrashFolder(selectedFolder), [selectedFolder]);
  const inDrafts = useMemo(() => isDraftsFolder(selectedFolder), [selectedFolder]);
  const userEmail = session?.email ?? "";

  useEffect(() => {
    if (!session?.token) return;
    void (async () => {
      await loadFolders();
      await selectFolder(useMailStore.getState().selectedFolder || "INBOX");
    })();
  }, [session?.token, loadFolders, selectFolder]);

  useEffect(() => {
    if (!session?.token) return;
    return onTabResume(() => {
      void syncCurrentFolder();
      void loadFolders();
    });
  }, [session?.token, loadFolders, syncCurrentFolder]);

  useEffect(() => {
    if (!session?.token) return;
    const timer = setTimeout(() => {
      void searchMessages(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMessages, session?.token]);

  useEffect(() => {
    return () => {
      clearSearch();
    };
  }, [clearSearch]);

  const openCompose = useCallback(
    (mode: MailComposeMode, initial: MailComposeInitialState | null) => {
      setComposeMode(mode);
      setComposeInitial(initial);
      setComposeOpen(true);
    },
    [],
  );

  const resolveActionMessage = useCallback(
    async (uid: string) => {
      if (selectedMessage?.uid === uid) return selectedMessage;
      await selectMessage(uid);
      return useMailStore.getState().selectedMessage;
    },
    [selectMessage, selectedMessage],
  );

  const handleMessageAction = useCallback(
    async (uid: string, action: MailMessageAction) => {
      setActionUid(uid);
      switch (action) {
        case "reply": {
          const message = await resolveActionMessage(uid);
          if (message == null) return;
          openCompose("reply", buildReplyComposeState(message, "reply", userEmail));
          return;
        }
        case "replyAll": {
          const message = await resolveActionMessage(uid);
          if (message == null) return;
          openCompose("replyAll", buildReplyComposeState(message, "replyAll", userEmail));
          return;
        }
        case "forward": {
          const message = await resolveActionMessage(uid);
          if (message == null) return;
          openCompose("forward", buildForwardComposeState(message));
          return;
        }
        case "toggleStar": {
          const summary = messagesRaw.find((item) => item.uid === uid);
          let flagged = summary?.flagged ?? false;
          if (summary == null && selectedMessage?.uid === uid) {
            flagged = selectedMessage.flagged;
          }
          await setMessageFlags(uid, {
            ...(flagged ? { removeFlags: ["\\Flagged"] } : { addFlags: ["\\Flagged"] }),
          });
          return;
        }
        case "markUnread": {
          await setMessageFlags(uid, { removeFlags: ["\\Seen"] });
          if (selectedUid === uid) {
            await selectMessage(uid, { markSeen: false });
          }
          return;
        }
        case "archive": {
          const archivePath = resolveSpecialFolderPath(foldersRaw, "Archive");
          if (archivePath == null) return;
          await moveMessage(uid, archivePath);
          return;
        }
        case "spam": {
          const spamPath = resolveSpecialFolderPath(foldersRaw, "Spam");
          if (spamPath == null) return;
          await moveMessage(uid, spamPath);
          return;
        }
        case "move": {
          await resolveActionMessage(uid);
          setMoveDialogOpen(true);
          return;
        }
        case "delete": {
          await resolveActionMessage(uid);
          if (isTrashFolder(selectedFolder)) {
            setDeleteConfirmOpen(true);
            return;
          }
          await deleteMessage(uid);
        }
      }
    },
    [
      deleteMessage,
      foldersRaw,
      messagesRaw,
      moveMessage,
      openCompose,
      resolveActionMessage,
      selectMessage,
      selectedFolder,
      selectedMessage,
      selectedUid,
      setMessageFlags,
      userEmail,
    ],
  );

  const handlePreviewAction = useCallback(
    (action: MailMessageAction) => {
      if (selectedUid == null) return;
      void handleMessageAction(selectedUid, action);
    },
    [handleMessageAction, selectedUid],
  );

  const handleSelectFolder = useCallback(
    (path: string) => {
      setNarrowPreviewOpen(false);
      void selectFolder(path);
    },
    [selectFolder],
  );

  const handleSelectMessage = useCallback(
    (uid: string) => {
      setNarrowPreviewOpen(true);
      void selectMessage(uid);
    },
    [selectMessage],
  );

  const handleBackToMessageList = useCallback(() => {
    setNarrowPreviewOpen(false);
  }, []);

  const handleToggleMessageStar = useCallback(
    (uid: string) => {
      void handleMessageAction(uid, "toggleStar");
    },
    [handleMessageAction],
  );

  const handleToggleMessageRead = useCallback(
    (uid: string) => {
      const summary = messagesRaw.find((message) => message.uid === uid);
      const seen = summary?.seen ?? (selectedMessage?.uid === uid && selectedMessage.seen);
      void setMessageFlags(uid, seen ? { removeFlags: ["\\Seen"] } : { addFlags: ["\\Seen"] });
    },
    [messagesRaw, selectedMessage, setMessageFlags],
  );

  const handleComposeOpen = useCallback(() => {
    setComposeDraftUid(null);
    openCompose("new", buildNewComposeState());
  }, [openCompose]);

  const handleEditDraft = useCallback(() => {
    if (selectedMessage == null || selectedUid == null) return;
    setComposeDraftUid(selectedUid);
    openCompose("new", buildDraftComposeState(selectedMessage));
  }, [openCompose, selectedMessage, selectedUid]);

  const handleComposeOpenChange = useCallback(
    (open: boolean) => {
      if (!open && composeDraftUid != null) {
        void deleteDraft(composeDraftUid);
      }
      setComposeOpen(open);
      if (!open) setComposeDraftUid(null);
    },
    [composeDraftUid, deleteDraft],
  );

  const handleComposeSend = useCallback(
    async (payload: MailComposePayload) => {
      try {
        if (composeDraftUid != null) {
          await saveDraft(payload, composeDraftUid);
          await sendDraft(composeDraftUid);
        } else {
          await sendMessage(payload);
        }
        setComposeOpen(false);
        setComposeDraftUid(null);
      } catch {
        /* error shown in store */
      }
    },
    [composeDraftUid, saveDraft, sendDraft, sendMessage],
  );

  const handleComposeAutosave = useCallback(
    async (payload: MailComposePayload) => {
      const savedUid = await saveDraft(payload, composeDraftUid ?? undefined);
      setComposeDraftUid((current) => current ?? savedUid);
    },
    [composeDraftUid, saveDraft],
  );

  const handleToggleBatchMode = useCallback(() => {
    setBatchMode((prev) => !prev);
    setSelectedUids([]);
  }, []);

  const handleToggleSelectUid = useCallback((uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid],
    );
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedUids.length === 0) return;
    await batchMessages(selectedUids, "delete");
    setSelectedUids([]);
    setBatchMode(false);
  }, [batchMessages, selectedUids]);

  const handleDownloadAttachment = useCallback(
    async (attachmentId: string) => {
      const token = session?.token;
      if (token == null || selectedUid == null) return;
      const meta = messageAttachments.find((item) => item.id === attachmentId);
      const blob = await downloadMailMessageAttachment(
        token,
        selectedFolder,
        selectedUid,
        attachmentId,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = meta?.filename ?? "attachment";
      link.click();
      URL.revokeObjectURL(url);
    },
    [messageAttachments, selectedFolder, selectedUid, session?.token],
  );

  const handleMoveToFolder = useCallback(
    async (folderPath: string) => {
      const uid = actionUid ?? selectedUid;
      if (uid == null) return;
      try {
        await moveMessage(uid, folderPath);
        setMoveDialogOpen(false);
      } catch {
        /* error shown in store */
      }
    },
    [actionUid, moveMessage, selectedUid],
  );

  const handleCreateFolder = useCallback(
    async (input: MailCreateFolderInput) => {
      setCreatingFolder(true);
      try {
        const path = await createFolder(input);
        setCreateFolderOpen(false);
        if (reopenMoveAfterCreateFolder) {
          setMoveDialogOpen(true);
          setReopenMoveAfterCreateFolder(false);
        } else if (path.length > 0) {
          await selectFolder(path);
        }
      } catch {
        /* error shown in store */
      } finally {
        setCreatingFolder(false);
      }
    },
    [createFolder, reopenMoveAfterCreateFolder, selectFolder],
  );

  const handleOpenCreateFolder = useCallback(() => {
    setReopenMoveAfterCreateFolder(false);
    setCreateFolderParent(selectedFolder);
    setCreateFolderOpen(true);
  }, [selectedFolder]);

  const handleOpenCreateFolderFromMove = useCallback(() => {
    setReopenMoveAfterCreateFolder(true);
    setCreateFolderParent(selectedFolder);
    setMoveDialogOpen(false);
    setCreateFolderOpen(true);
  }, [selectedFolder]);

  const handleConfirmDelete = useCallback(async () => {
    const uid = actionUid ?? selectedUid;
    if (uid == null) return;
    setDeleting(true);
    try {
      await deleteMessage(uid);
      setDeleteConfirmOpen(false);
    } catch {
      /* error shown in store */
    } finally {
      setDeleting(false);
    }
  }, [actionUid, deleteMessage, selectedUid]);

  const handleToggleFoldersCompact = useCallback(() => {
    setFoldersCompact((value) => !value);
  }, []);

  const handleFolderAction = useCallback(
    (path: string, action: MailFolderAction) => {
      setFolderActionPath(path);
      switch (action) {
        case "markAllRead":
          void markFolderAllRead(path);
          return;
        case "rename":
          setFolderDialog("rename");
          return;
        case "move":
          setFolderDialog("move");
          return;
        case "delete":
          setFolderDialog("delete");
          return;
        case "clear":
          setFolderDialog("clear");
      }
    },
    [markFolderAllRead],
  );

  const handleConfirmDeleteFolder = useFolderDialogAction(
    folderActionPath,
    setFolderDialog,
    setFolderActionPending,
    deleteFolder,
  );

  const handleConfirmClearFolder = useFolderDialogAction(
    folderActionPath,
    setFolderDialog,
    setFolderActionPending,
    clearFolder,
  );

  const handleRenameFolderSubmit = useFolderDialogSubmitAction<string>(
    folderActionPath,
    setFolderDialog,
    setFolderActionPending,
    async (path, name) => {
      await renameFolder({ path, name });
    },
  );

  const handleMoveFolderSubmit = useFolderDialogSubmitAction<string>(
    folderActionPath,
    setFolderDialog,
    setFolderActionPending,
    async (path, parentPath) => {
      await moveFolder({ path, parentPath });
    },
  );

  const handleFolderDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setFolderDialog(null);
  }, []);

  const handleLoadMore = useCallback(() => {
    void loadMoreMessages();
  }, [loadMoreMessages]);

  return {
    session,
    sending,
    error,
    composeOpen,
    composeMode,
    composeInitial,
    searchQuery,
    foldersCompact,
    folders,
    folderDelimiter,
    messages,
    messagesNextCursor,
    loadingMoreMessages,
    messageAttachments,
    selectedFolder,
    selectedUid,
    selectedMessage,
    loadingMessages,
    loadingMessage,
    inTrash,
    inDrafts,
    batchMode,
    selectedUids,
    narrowPreviewOpen,
    moveDialogOpen,
    createFolderOpen,
    createFolderParent,
    deleteConfirmOpen,
    creatingFolder,
    deleting,
    folderDialog,
    folderActionTarget,
    folderActionPending,
    setSearchQuery,
    setMoveDialogOpen,
    setCreateFolderOpen,
    setDeleteConfirmOpen,
    handleSelectFolder,
    handleSelectMessage,
    handleBackToMessageList,
    handleToggleMessageStar,
    handleToggleMessageRead,
    handleComposeOpen,
    handleComposeOpenChange,
    composeDraftUid,
    handleEditDraft,
    handleComposeAutosave,
    handleToggleBatchMode,
    handleToggleSelectUid,
    handleBatchDelete,
    handleDownloadAttachment,
    handleComposeSend,
    handlePreviewAction,
    handleMessageAction,
    handleMoveToFolder,
    handleCreateFolder,
    handleOpenCreateFolder,
    handleOpenCreateFolderFromMove,
    handleConfirmDelete,
    handleToggleFoldersCompact,
    handleFolderAction,
    handleRenameFolderSubmit,
    handleMoveFolderSubmit,
    handleConfirmDeleteFolder,
    handleConfirmClearFolder,
    handleFolderDialogOpenChange,
    handleLoadMore,
  };
}
