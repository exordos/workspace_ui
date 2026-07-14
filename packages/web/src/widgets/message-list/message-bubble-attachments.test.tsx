import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import type { MockMessage } from "~/shared/api/messenger.types";
import type * as AuthGuardModule from "~/shared/lib/auth-guard";
import { testMessageId } from "~/test/factories";
import { MessageBubble } from "./message-bubble.ui";
import type * as AttachmentDownloadModule from "./message-attachment-download.lib";

const downloadWorkspaceFileAttachmentMock = vi.fn();

vi.mock("~/shared/api/messenger-client.internal", () => ({
  getRealmBaseUrl: () => "https://uploads.example.com",
}));

vi.mock("./message-attachment-download.lib", async () => {
  const actual = await vi.importActual<typeof AttachmentDownloadModule>(
    "./message-attachment-download.lib",
  );
  return {
    ...actual,
    downloadWorkspaceFileAttachment: (...args: unknown[]) =>
      downloadWorkspaceFileAttachmentMock(...args),
  };
});

vi.mock("~/shared/lib/auth-guard", async () => {
  const actual = await vi.importActual<typeof AuthGuardModule>("~/shared/lib/auth-guard");
  return {
    ...actual,
    buildAuthHeader: () => ({ Authorization: "Bearer token" }),
  };
});

function msg(overrides: Partial<MockMessage> = {}): MockMessage {
  const base: MockMessage = {
    id: "00000000-0000-4000-8000-000000000001",
    sender_id: 77,
    sender_full_name: "Alice",
    stream_uuid: "00000000-0000-4000-8000-000000000010",
    subject: "general",
    content:
      '<p><a href="/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download">report.pdf</a></p>',
    timestamp: 1710000000,
  };
  return {
    ...base,
    ...overrides,
    stream_uuid: overrides.stream_uuid ?? base.stream_uuid,
    subject: overrides.subject ?? base.subject,
  };
}

describe("MessageBubble attachment links", () => {
  beforeEach(() => {
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
    downloadWorkspaceFileAttachmentMock.mockReset();
    downloadWorkspaceFileAttachmentMock.mockResolvedValue(true);
  });

  it("does not decorate regular links as attachment actions", async () => {
    render(
      <MessageBubble
        message={msg({
          content: '<p><a href="https://example.com/clip.webm">clip.webm</a></p>',
        })}
      />,
    );

    const link = await screen.findByRole("link", { name: "clip.webm" });
    expect(link).not.toHaveAttribute("data-attachment-link");
  });

  it("decorates workspace file download links as attachment actions", async () => {
    render(<MessageBubble message={msg()} />);

    const link = await screen.findByRole("link", { name: "report.pdf" });
    await waitFor(() => {
      expect(link).toHaveAttribute("data-attachment-link", "true");
    });
  });

  it("decorates Workspace file URN links as attachment actions", async () => {
    render(
      <MessageBubble
        message={msg({
          content:
            '<p><a href="urn:file:55555555-5555-4555-8555-555555555555?name=report.pdf&amp;content_type=application%2Fpdf&amp;size=4096">report.pdf</a></p>',
        })}
      />,
    );

    const link = await screen.findByRole("link", { name: "report.pdf" });
    await waitFor(() => {
      expect(link).toHaveAttribute("data-attachment-link", "true");
    });
    expect(link).toHaveAttribute(
      "href",
      "/api/workspace/v1/messenger/files/55555555-5555-4555-8555-555555555555/actions/download",
    );
  });

  it("opens message context menu on right click", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId(`message-${testMessageId(1)}`);
    fireEvent.contextMenu(bubble);

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("opens message context menu from keyboard ContextMenu key", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId(`message-${testMessageId(1)}`);
    fireEvent.keyDown(bubble, { key: "ContextMenu" });

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("opens message context menu from keyboard Shift+F10", async () => {
    render(<MessageBubble message={msg()} />);

    const bubble = screen.getByTestId(`message-${testMessageId(1)}`);
    fireEvent.keyDown(bubble, { key: "F10", shiftKey: true });

    expect(await screen.findByRole("menuitem", { name: /reply/i })).toBeInTheDocument();
  });

  it("downloads workspace file attachments via authenticated helper", async () => {
    render(<MessageBubble message={msg()} />);

    const link = await screen.findByRole("link", { name: "report.pdf" });
    fireEvent.click(link);

    await waitFor(() => {
      expect(downloadWorkspaceFileAttachmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download",
          fileName: "report.pdf",
          authHeaders: { Authorization: "Bearer token" },
          onProgress: expect.any(Function),
        }),
      );
    });

    await waitFor(() => {
      expect(useDownloadStore.getState().entries[0]).toMatchObject({
        path: "/api/workspace/v1/messenger/files/33333333-3333-4333-8333-333333333333/actions/download",
        status: "downloaded",
      });
    });
  });

  it("downloads Workspace file URN attachments via authenticated helper", async () => {
    render(
      <MessageBubble
        message={msg({
          content:
            '<p><a href="urn:file:55555555-5555-4555-8555-555555555555?name=report.pdf&amp;content_type=application%2Fpdf&amp;size=4096">report.pdf</a></p>',
        })}
      />,
    );

    const link = await screen.findByRole("link", { name: "report.pdf" });
    fireEvent.click(link);

    await waitFor(() => {
      expect(downloadWorkspaceFileAttachmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/workspace/v1/messenger/files/55555555-5555-4555-8555-555555555555/actions/download",
          fileName: "report.pdf",
          authHeaders: { Authorization: "Bearer token" },
          onProgress: expect.any(Function),
        }),
      );
    });
  });
});
