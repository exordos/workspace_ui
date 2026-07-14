import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMailStore } from "./mail.model";

vi.mock("./mail.api", () => ({
  createMailSession: vi.fn(),
  deleteMailSession: vi.fn(),
  fetchMailFolders: vi.fn(),
  fetchMailMessage: vi.fn(),
  fetchMailMessages: vi.fn(),
  sendMailMessage: vi.fn(),
  deleteMailMessage: vi.fn(),
  moveMailMessage: vi.fn(),
  patchMailMessageFlags: vi.fn(),
  createMailDraft: vi.fn(),
  updateMailDraft: vi.fn(),
  sendMailDraft: vi.fn(),
  deleteMailDraft: vi.fn(),
  createMailFolder: vi.fn(),
  renameMailFolder: vi.fn(),
  moveMailFolder: vi.fn(),
  deleteMailFolder: vi.fn(),
  clearMailFolder: vi.fn(),
  markAllMailFolderRead: vi.fn(),
}));

import {
  createMailDraft,
  createMailSession,
  fetchMailFolders,
  fetchMailMessage,
  fetchMailMessages,
} from "./mail.api";

describe("useMailStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useMailStore.getState().clear();
    vi.mocked(createMailSession).mockReset();
    vi.mocked(fetchMailFolders).mockReset();
    vi.mocked(fetchMailMessages).mockReset();
    vi.mocked(fetchMailMessage).mockReset();
  });

  afterEach(() => {
    sessionStorage.clear();
    useMailStore.getState().clear();
  });

  it("signIn stores session and loads folders", async () => {
    vi.mocked(createMailSession).mockResolvedValue({
      token: "tok",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      email: "user@example.com",
    });
    vi.mocked(fetchMailFolders).mockResolvedValue({
      folders: [{ path: "INBOX", name: "Inbox", unread: 1, total: 2 }],
      delimiter: ".",
    });
    vi.mocked(fetchMailMessages).mockResolvedValue({ messages: [], nextCursor: null });

    await useMailStore.getState().signIn("user@example.com", "secret");

    expect(useMailStore.getState().session?.token).toBe("tok");
    expect(useMailStore.getState().folders).toHaveLength(1);
  });

  it("clear resets state", () => {
    useMailStore.setState({
      session: { token: "t", expiresAt: new Date().toISOString(), email: "a@b.com" },
      folders: [{ path: "INBOX", name: "Inbox", unread: 0, total: 0 }],
    });
    useMailStore.getState().clear();
    expect(useMailStore.getState().session).toBeNull();
    expect(useMailStore.getState().folders).toHaveLength(0);
  });

  it("returns the created draft uid so autosave can update the same draft", async () => {
    useMailStore.setState({
      session: { token: "tok", expiresAt: new Date().toISOString(), email: "a@b.com" },
      folders: [{ path: "Drafts", name: "Drafts", unread: 0, total: 0 }],
    });
    vi.mocked(createMailDraft).mockResolvedValue({
      uid: "draft-1",
      from: "a@b.com",
      to: ["recipient@example.com"],
      cc: [],
      subject: "Draft",
      snippet: "Body",
      date: new Date().toISOString(),
      seen: true,
      flagged: false,
      bodyHtml: "<p>Body</p>",
      bodyText: "Body",
      messageId: null,
      replyTo: null,
      references: null,
    });
    vi.mocked(fetchMailFolders).mockResolvedValue({
      folders: [{ path: "Drafts", name: "Drafts", unread: 0, total: 1 }],
      delimiter: ".",
    });

    const uid = await useMailStore.getState().saveDraft({
      to: "recipient@example.com",
      subject: "Draft",
      bodyHtml: "<p>Body</p>",
    });

    expect(uid).toBe("draft-1");
    expect(createMailDraft).toHaveBeenCalledOnce();
  });

  it("clears session and shows auth again when API returns 401", async () => {
    useMailStore.setState({
      session: {
        token: "expired",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        email: "a@b.com",
      },
    });
    sessionStorage.setItem(
      "workspace-mail-session",
      JSON.stringify({
        token: "expired",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        email: "a@b.com",
      }),
    );
    vi.mocked(fetchMailFolders).mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );

    await useMailStore.getState().loadFolders();

    expect(useMailStore.getState().session).toBeNull();
    expect(sessionStorage.getItem("workspace-mail-session")).toBeNull();
    expect(useMailStore.getState().error).toMatch(/session expired|истекла/i);
  });

  it("selectMessage marks message and folder unread as read locally", async () => {
    useMailStore.setState({
      session: { token: "tok", expiresAt: new Date().toISOString(), email: "a@b.com" },
      selectedFolder: "INBOX",
      folders: [{ path: "INBOX", name: "Inbox", unread: 2, total: 3 }],
      messages: [
        {
          uid: "1",
          from: "Alice <alice@example.com>",
          subject: "Hello",
          snippet: "Hi",
          date: new Date().toISOString(),
          seen: false,
          flagged: false,
        },
      ],
    });
    vi.mocked(fetchMailMessage).mockResolvedValue({
      uid: "1",
      from: "Alice <alice@example.com>",
      subject: "Hello",
      snippet: "Hi",
      date: new Date().toISOString(),
      seen: true,
      flagged: false,
      bodyHtml: null,
      bodyText: "Hi",
      messageId: null,
      replyTo: null,
      to: [],
      cc: [],
      references: null,
    });

    await useMailStore.getState().selectMessage("1");

    expect(useMailStore.getState().messages[0]?.seen).toBe(true);
    expect(useMailStore.getState().folders[0]?.unread).toBe(1);
    expect(useMailStore.getState().selectedMessage?.seen).toBe(true);
  });
});
