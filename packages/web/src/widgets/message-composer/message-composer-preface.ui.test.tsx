import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { MessageComposerPreface } from "./message-composer-preface.ui";
import type { MessageComposerPrefaceProps } from "./message-composer.types";

const createProps = (
  overrides: Partial<MessageComposerPrefaceProps> = {},
): MessageComposerPrefaceProps => ({
  uploadProgress: null,
  uploadProgressPercent: 0,
  files: [],
  filePreviewUrls: [],
  isUploadInProgress: false,
  removeFile: vi.fn(),
  scheduledMessages: [],
  onCancelScheduled: vi.fn(),
  replyQuote: null,
  ...overrides,
});

describe("MessageComposerPreface upload progress", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("keeps optimistic upload progress and cancel visible after draft files are cleared", () => {
    const onCancelUpload = vi.fn();

    render(
      <MessageComposerPreface
        {...createProps({
          uploadProgress: {
            completed: 1,
            total: 2,
            activeFileName: "sent-document.pdf",
          },
          uploadProgressPercent: 50,
          isUploadInProgress: true,
          onCancelUpload,
          separateUploadProgress: true,
        })}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Uploading sent-document.pdf: 50%" }),
    ).toHaveAttribute("aria-valuenow", "50");

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload of sent-document.pdf" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
  });

  it("keeps an optimistic upload separate from newly attached draft files", () => {
    const removeFile = vi.fn();
    const newDraftFile = new File(["draft"], "new-draft.txt", { type: "text/plain" });

    render(
      <MessageComposerPreface
        {...createProps({
          uploadProgress: {
            completed: 0,
            total: 1,
            activeFileName: "already-sent.pdf",
          },
          uploadProgressPercent: 0,
          isUploadInProgress: true,
          separateUploadProgress: true,
          files: [newDraftFile],
          filePreviewUrls: [null],
          removeFile,
        })}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Uploading already-sent.pdf: 0%" }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("new-draft.txt")).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: /Uploading new-draft\.txt/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove new-draft.txt" }));
    expect(removeFile).toHaveBeenCalledWith(0);
  });

  it("shows controlled progress and exposes retry and remove for an upload error", () => {
    const onRemoveAttachment = vi.fn();
    const onRetryAttachment = vi.fn();

    render(
      <MessageComposerPreface
        {...createProps({
          attachments: [
            {
              localId: "uploading-id",
              fileName: "uploading.pdf",
              sizeBytes: 10,
              contentType: "application/pdf",
              previewUrl: null,
              status: "uploading",
              loadedBytes: 4,
              totalBytes: 10,
              error: null,
              retryable: false,
            },
            {
              localId: "error-id",
              fileName: "failed.pdf",
              sizeBytes: 10,
              contentType: "application/pdf",
              previewUrl: null,
              status: "error",
              loadedBytes: 0,
              totalBytes: 10,
              error: "Upload failed",
              retryable: true,
            },
          ],
          onRemoveAttachment,
          onRetryAttachment,
        })}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Uploading uploading.pdf: 40%" }),
    ).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("Upload failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry upload of failed.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove failed.pdf" }));
    expect(onRetryAttachment).toHaveBeenCalledWith("error-id");
    expect(onRemoveAttachment).toHaveBeenCalledWith("error-id");
  });
});

describe("MessageComposerPreface reply chrome", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("uses the solid composer surface instead of a translucent overlay", () => {
    const { container } = render(
      <MessageComposerPreface
        {...createProps({
          replyQuote: {
            id: 1,
            content: "quoted text",
            sender_full_name: "Alice",
            permalinkUrl: null,
          },
          roundTop: true,
        })}
      />,
    );

    const chrome = container.querySelector("[data-composer-reply-chrome='true']");
    expect(chrome).not.toBeNull();
    expect(chrome).not.toHaveClass("bg-bg/50");
    expect(chrome).not.toHaveClass("border-b");
    expect(chrome).toHaveClass("rounded-t-xl");
    expect(screen.getByText(/Reply: Alice/i)).toBeInTheDocument();
  });

  it("keeps reply chrome square on top when the shell is joined above", () => {
    const { container } = render(
      <MessageComposerPreface
        {...createProps({
          replyQuote: {
            id: 1,
            content: "quoted text",
            sender_full_name: "Alice",
            permalinkUrl: null,
          },
          joinedTop: true,
          roundTop: false,
        })}
      />,
    );

    const chrome = container.querySelector("[data-composer-reply-chrome='true']");
    expect(chrome).not.toBeNull();
    expect(chrome).not.toHaveClass("rounded-t-xl");
  });

  it("wraps the reply preview in the shared workspace quote frame", () => {
    const { container } = render(
      <MessageComposerPreface
        {...createProps({
          replyQuote: {
            id: 1,
            content: "quoted text",
            sender_full_name: "Alice",
            permalinkUrl: null,
          },
        })}
      />,
    );

    const quoteFrame = container.querySelector("[data-composer-reply-quote='true']");
    expect(quoteFrame).not.toBeNull();
    expect(quoteFrame).toHaveClass(
      "border-l-2",
      "border-accent",
      "bg-composer-outer",
      "rounded-md",
    );
    expect(quoteFrame).not.toHaveClass("bg-bg/35");
    expect(screen.getByText(/Reply: Alice/i)).toHaveClass("text-accent");
    expect(screen.getByText("quoted text")).toBeInTheDocument();
  });

  it("aligns reply chrome rows with the composer content inset", () => {
    const { container } = render(
      <MessageComposerPreface
        {...createProps({
          replyLeadingContent: <div data-testid="reply-tabs">tabs</div>,
          replyQuote: {
            id: 1,
            content: "quoted text",
            sender_full_name: "Alice",
            permalinkUrl: null,
          },
        })}
      />,
    );

    const tabsRow = screen.getByTestId("reply-tabs").parentElement?.parentElement;
    const quoteRow = container.querySelector("[data-composer-reply-quote='true']")?.parentElement
      ?.parentElement;
    expect(tabsRow).toHaveClass("px-2");
    expect(quoteRow).toHaveClass("px-2", "pt-2", "pb-1");
    expect(quoteRow).not.toHaveClass("py-2");
  });
});
