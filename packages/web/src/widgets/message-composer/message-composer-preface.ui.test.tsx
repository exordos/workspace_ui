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
