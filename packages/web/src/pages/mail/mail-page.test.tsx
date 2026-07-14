import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMailStore } from "~/entities/mail/mail.model";
import { renderWithProviders } from "~/test/render";
import { MailPage } from "./mail-page.ui";

const mailApiMocks = vi.hoisted(() => ({
  fetchMailFolders: vi.fn(),
  fetchMailMessages: vi.fn(),
  syncMailFolder: vi.fn(),
}));

vi.mock("~/entities/mail/mail.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/entities/mail/mail.api")>()),
  ...mailApiMocks,
}));

describe("MailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useMailStore.getState().clear();
  });

  it("opens the local mailbox with the current Workspace IAM session", async () => {
    mailApiMocks.fetchMailFolders.mockResolvedValue({
      folders: [{ uuid: "folder-1", path: "INBOX", name: "Inbox", unread: 1, total: 2 }],
      delimiter: ".",
    });
    mailApiMocks.fetchMailMessages.mockResolvedValue({
      messages: [
        {
          uid: "message-1",
          from: "Alice <alice@example.com>",
          subject: "Hello",
          snippet: "Hi there",
          date: new Date().toISOString(),
          seen: false,
          flagged: false,
        },
      ],
      nextCursor: null,
    });

    renderWithProviders(<MailPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mail/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());
    expect(mailApiMocks.fetchMailFolders).toHaveBeenCalled();
  });
});
