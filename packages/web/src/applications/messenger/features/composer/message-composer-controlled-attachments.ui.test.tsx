import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageComposerControlledAttachmentCards } from "./message-composer-controlled-attachments.ui";
import type { MessageComposerAttachmentView } from "./message-composer.types";

const base = { sizeBytes: 5, loadedBytes: 2, totalBytes: 5, error: null, retryable: false };
const attachments: MessageComposerAttachmentView[] = [
  {
    ...base,
    localId: "image",
    fileName: "photo.png",
    contentType: "image/png",
    previewUrl: "blob:image",
    status: "ready",
  },
  {
    ...base,
    localId: "video",
    fileName: "clip.mp4",
    contentType: "video/mp4",
    previewUrl: null,
    mediaUrl: "blob:video",
    status: "uploading",
  },
  {
    ...base,
    localId: "file",
    fileName: "doc.pdf",
    contentType: "application/pdf",
    previewUrl: null,
    status: "ready",
  },
];

describe("composer attachment preview actions", () => {
  it("opens local images and uploading video without opening non-media files or triggering removal", () => {
    const open = vi.fn();
    const remove = vi.fn();
    render(
      <MessageComposerControlledAttachmentCards
        attachments={attachments}
        onOpenComposerMedia={open}
        onRemoveAttachment={remove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open photo.png/i }));
    fireEvent.click(screen.getByRole("button", { name: /open clip.mp4/i }));
    expect(open).toHaveBeenNthCalledWith(1, "image", attachments);
    expect(open).toHaveBeenNthCalledWith(2, "video", attachments);
    expect(screen.queryByRole("button", { name: /open doc.pdf/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cancel upload of clip.mp4/i }));
    expect(remove).toHaveBeenCalledWith("video");
    expect(open).toHaveBeenCalledTimes(2);
  });
});
