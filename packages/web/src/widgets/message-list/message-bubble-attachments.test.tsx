import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import type * as AuthGuardModule from "~/shared/lib/auth-guard";
import { MessageBubble } from "./message-bubble.ui";
import type * as AttachmentDownloadModule from "./message-attachment-download.lib";

const downloadUserUploadAttachmentMock = vi.fn();

vi.mock("./message-attachment-download.lib", async () => {
  const actual = await vi.importActual<typeof AttachmentDownloadModule>(
    "./message-attachment-download.lib",
  );
  return {
    ...actual,
    downloadUserUploadAttachment: (...args: unknown[]) => downloadUserUploadAttachmentMock(...args),
  };
});

vi.mock("~/shared/lib/auth-guard", async () => {
  const actual = await vi.importActual<typeof AuthGuardModule>("~/shared/lib/auth-guard");
  return {
    ...actual,
    buildAuthHeader: () => ({ Authorization: "Basic token" }),
  };
});

function msg(overrides: Partial<MockMessage> = {}): MockMessage {
  const base: MockMessage = {
    id: 1,
    sender_id: 77,
    sender_full_name: "Alice",
    stream_id: 10,
    subject: "general",
    content: '<p><a href="/user_uploads/1/report.pdf">report.pdf</a></p>',
    timestamp: 1710000000,
  };
  return {
    ...base,
    ...overrides,
    stream_id: overrides.stream_id ?? base.stream_id,
    subject: overrides.subject ?? base.subject,
  };
}

describe("MessageBubble attachment links", () => {
  beforeEach(() => {
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
    downloadUserUploadAttachmentMock.mockReset();
    downloadUserUploadAttachmentMock.mockResolvedValue(true);
  });

  it("decorates user_upload links as attachment actions", async () => {
    render(<MessageBubble message={msg()} />);

    const link = await screen.findByRole("link", { name: "report.pdf" });
    await waitFor(() => {
      expect(link).toHaveAttribute("data-attachment-link", "true");
    });
  });

  it("opens message context menu on right click", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId("message-1");
    fireEvent.contextMenu(bubble);

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("opens message context menu from keyboard ContextMenu key", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId("message-1");
    fireEvent.keyDown(bubble, { key: "ContextMenu" });

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("opens message context menu from keyboard Shift+F10", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId("message-1");
    fireEvent.keyDown(bubble, { key: "F10", shiftKey: true });

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("downloads user_upload attachments via authenticated helper", async () => {
    render(<MessageBubble message={msg()} />);

    const link = await screen.findByRole("link", { name: "report.pdf" });
    fireEvent.click(link);

    await waitFor(() => {
      expect(downloadUserUploadAttachmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/user_uploads/1/report.pdf",
          fileName: "report.pdf",
          authHeaders: { Authorization: "Basic token" },
          onProgress: expect.any(Function),
        }),
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        path: "/user_uploads/1/report.pdf",
        status: "downloaded",
      });
    });
  });
});
