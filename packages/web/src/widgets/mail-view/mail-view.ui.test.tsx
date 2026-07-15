import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MailView } from "./mail-view.ui";

const hookState = vi.hoisted(() => ({ narrowPreviewOpen: false }));

vi.mock("./mail-view.hook", () => ({
  useMailView: () => ({
    sending: false,
    error: null,
    composeOpen: false,
    composeMode: "new",
    composeInitial: null,
    searchQuery: "",
    foldersCompact: false,
    folders: [],
    folderDelimiter: ".",
    messages: [],
    messagesNextCursor: null,
    loadingMoreMessages: false,
    messageAttachments: [],
    selectedFolder: "INBOX",
    selectedUid: null,
    selectedMessage: null,
    loadingMessages: false,
    loadingMessage: false,
    inTrash: false,
    inDrafts: false,
    batchMode: false,
    selectedUids: [],
    narrowPreviewOpen: hookState.narrowPreviewOpen,
    moveDialogOpen: false,
    createFolderOpen: false,
    createFolderParent: "",
    deleteConfirmOpen: false,
    creatingFolder: false,
    deleting: false,
    folderDialog: null,
    folderActionTarget: null,
    folderActionPending: false,
  }),
}));

vi.mock("./mail-folder-list.ui", () => ({ MailFolderList: () => <div /> }));
vi.mock("./mail-message-list.ui", () => ({ MailMessageList: () => <div /> }));
vi.mock("./mail-message-preview.ui", () => ({ MailMessagePreview: () => <div /> }));
vi.mock("./mail-view-toolbar.ui", () => ({ MailViewToolbar: () => <div /> }));
vi.mock("~/features/mail-compose/mail-compose.ui", () => ({ MailComposeDialog: () => null }));
vi.mock("~/features/mail-folder-actions/mail-folder-confirm-dialog.ui", () => ({
  MailFolderConfirmDialog: () => null,
}));
vi.mock("~/features/mail-folder-actions/mail-move-mailbox-dialog.ui", () => ({
  MailMoveMailboxDialog: () => null,
}));
vi.mock("~/features/mail-folder-actions/mail-rename-folder-dialog.ui", () => ({
  MailRenameFolderDialog: () => null,
}));
vi.mock("~/features/mail-message-actions/mail-create-folder-dialog.ui", () => ({
  MailCreateFolderDialog: () => null,
}));
vi.mock("~/features/mail-message-actions/mail-delete-confirm-dialog.ui", () => ({
  MailDeleteConfirmDialog: () => null,
}));
vi.mock("~/features/mail-message-actions/mail-move-folder-dialog.ui", () => ({
  MailMoveFolderDialog: () => null,
}));

describe("MailView responsive shell", () => {
  it("uses desktop three-pane and tablet icon-rail columns", () => {
    render(<MailView />);

    expect(screen.getByTestId("mail-responsive-shell")).toHaveClass(
      "grid-cols-[56px_minmax(0,1fr)]",
      "md:grid-cols-[56px_minmax(280px,320px)_minmax(0,1fr)]",
      "lg:grid-cols-[216px_minmax(320px,360px)_minmax(0,1fr)]",
    );
  });

  it("switches the narrow active panel without hiding either tablet panel", () => {
    const { rerender } = render(<MailView />);
    expect(screen.getByTestId("mail-message-list-panel")).toHaveClass("flex", "md:flex");
    expect(screen.getByTestId("mail-message-preview-panel")).toHaveClass("hidden", "md:block");

    hookState.narrowPreviewOpen = true;
    rerender(<MailView />);

    expect(screen.getByTestId("mail-message-list-panel")).toHaveClass("hidden", "md:flex");
    expect(screen.getByTestId("mail-message-preview-panel")).toHaveClass("block", "md:block");
  });
});
