import React, { useMemo } from "react";
import { isTrashFolder } from "~/entities/mail/mail.lib";
import { MailComposeDialog } from "~/features/mail-compose/mail-compose.ui";
import { MailFolderConfirmDialog } from "~/features/mail-folder-actions/mail-folder-confirm-dialog.ui";
import { MailMoveMailboxDialog } from "~/features/mail-folder-actions/mail-move-mailbox-dialog.ui";
import { MailRenameFolderDialog } from "~/features/mail-folder-actions/mail-rename-folder-dialog.ui";
import { MailCreateFolderDialog } from "~/features/mail-message-actions/mail-create-folder-dialog.ui";
import { MailDeleteConfirmDialog } from "~/features/mail-message-actions/mail-delete-confirm-dialog.ui";
import { MailMoveFolderDialog } from "~/features/mail-message-actions/mail-move-folder-dialog.ui";
import { t } from "~/i18n/i18n";
import { MailFolderList } from "./mail-folder-list.ui";
import { MailMessageList } from "./mail-message-list.ui";
import { MailMessagePreview } from "./mail-message-preview.ui";
import { MailViewToolbar } from "./mail-view-toolbar.ui";
import { useMailView } from "./mail-view.hook";

export const MailView: React.FC = () => {
  const {
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
    handleComposeSend,
    handlePreviewAction,
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
    handleEditDraft,
    handleComposeAutosave,
    handleToggleBatchMode,
    handleToggleSelectUid,
    handleBatchDelete,
    handleDownloadAttachment,
  } = useMailView();

  const clearFolderIsTrash = useMemo(
    () => folderActionTarget != null && isTrashFolder(folderActionTarget.path),
    [folderActionTarget],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:p-3">
      <MailViewToolbar
        searchQuery={searchQuery}
        batchMode={batchMode}
        selectedCount={selectedUids.length}
        onSearchChange={setSearchQuery}
        onComposeOpen={handleComposeOpen}
        onToggleBatchMode={handleToggleBatchMode}
        onBatchDelete={handleBatchDelete}
      />

      {error != null && error.length > 0 ? (
        <p className="mb-2 text-sm text-notice-base" role="alert">
          {error}
        </p>
      ) : null}

      <div
        data-testid="mail-responsive-shell"
        className={`grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-sm ring-1 ring-border-subtle md:grid-cols-[56px_minmax(280px,320px)_minmax(0,1fr)] ${
          foldersCompact
            ? "lg:grid-cols-[56px_minmax(320px,360px)_minmax(0,1fr)]"
            : "lg:grid-cols-[216px_minmax(320px,360px)_minmax(0,1fr)]"
        }`}
      >
        <aside className="col-start-1 row-start-1 min-h-0 shrink-0 overflow-hidden border-r border-border-subtle bg-sidebar-bg">
          <MailFolderList
            folders={folders}
            delimiter={folderDelimiter}
            selectedFolder={selectedFolder}
            compact={foldersCompact}
            onSelectFolder={handleSelectFolder}
            onToggleCompact={handleToggleFoldersCompact}
            onCreateFolder={handleOpenCreateFolder}
            onFolderAction={handleFolderAction}
          />
        </aside>
        <section
          data-testid="mail-message-list-panel"
          className={`${narrowPreviewOpen ? "hidden" : "flex"} col-start-2 row-start-1 min-h-0 flex-col bg-sidebar-bg md:flex md:border-r md:border-border-subtle`}
        >
          <MailMessageList
            messages={messages}
            selectedUid={selectedUid}
            loading={loadingMessages}
            loadingMore={loadingMoreMessages}
            hasMore={messagesNextCursor != null}
            batchMode={batchMode}
            selectedUids={selectedUids}
            onLoadMore={handleLoadMore}
            onSelectMessage={handleSelectMessage}
            onToggleSelectUid={handleToggleSelectUid}
            onToggleStar={handleToggleMessageStar}
            onToggleRead={handleToggleMessageRead}
          />
        </section>
        <section
          data-testid="mail-message-preview-panel"
          className={`${narrowPreviewOpen ? "block" : "hidden"} col-start-2 row-start-1 min-h-0 min-w-0 overflow-visible bg-bg md:col-start-3 md:block`}
        >
          <MailMessagePreview
            loading={loadingMessage}
            message={selectedMessage}
            attachments={messageAttachments}
            inTrash={inTrash}
            inDrafts={inDrafts}
            onAction={handlePreviewAction}
            onEditDraft={handleEditDraft}
            onDownloadAttachment={handleDownloadAttachment}
            onBack={handleBackToMessageList}
          />
        </section>
      </div>

      <MailComposeDialog
        open={composeOpen}
        mode={composeMode}
        initial={composeInitial}
        sending={sending}
        error={null}
        onOpenChange={handleComposeOpenChange}
        onSend={handleComposeSend}
        onAutosave={handleComposeAutosave}
      />

      <MailMoveFolderDialog
        open={moveDialogOpen}
        folders={folders}
        delimiter={folderDelimiter}
        currentFolder={selectedFolder}
        onOpenChange={setMoveDialogOpen}
        onMove={handleMoveToFolder}
        onCreateFolder={handleOpenCreateFolderFromMove}
      />

      <MailCreateFolderDialog
        open={createFolderOpen}
        creating={creatingFolder}
        folders={folders}
        delimiter={folderDelimiter}
        defaultParentPath={createFolderParent}
        onOpenChange={setCreateFolderOpen}
        onCreate={handleCreateFolder}
      />

      <MailDeleteConfirmDialog
        open={deleteConfirmOpen}
        deleting={deleting}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleConfirmDelete}
      />

      <MailRenameFolderDialog
        open={folderDialog === "rename"}
        pending={folderActionPending}
        folder={folderActionTarget}
        delimiter={folderDelimiter}
        onOpenChange={handleFolderDialogOpenChange}
        onRename={handleRenameFolderSubmit}
      />

      <MailMoveMailboxDialog
        open={folderDialog === "move"}
        pending={folderActionPending}
        folder={folderActionTarget}
        folders={folders}
        delimiter={folderDelimiter}
        onOpenChange={handleFolderDialogOpenChange}
        onMove={handleMoveFolderSubmit}
      />

      <MailFolderConfirmDialog
        open={folderDialog === "delete"}
        pending={folderActionPending}
        title={t("mail.folderActions.deleteConfirmTitle")}
        body={t("mail.folderActions.deleteConfirmBody")}
        submitLabel={t("common.delete")}
        onOpenChange={handleFolderDialogOpenChange}
        onConfirm={handleConfirmDeleteFolder}
      />

      <MailFolderConfirmDialog
        open={folderDialog === "clear"}
        pending={folderActionPending}
        title={t("mail.folderActions.clearConfirmTitle")}
        body={
          clearFolderIsTrash
            ? t("mail.folderActions.clearTrashConfirmBody")
            : t("mail.folderActions.clearConfirmBody")
        }
        submitLabel={t("mail.folderActions.clear")}
        onOpenChange={handleFolderDialogOpenChange}
        onConfirm={handleConfirmClearFolder}
      />
    </div>
  );
};
