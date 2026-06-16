import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handlers } from "~/test/mocks/handlers";
import { renderWithProviders } from "~/test/render";

const mailApiMocks = vi.hoisted(() => ({
  createMailSession: vi.fn(),
  deleteMailSession: vi.fn(),
  fetchMailFolders: vi.fn(),
  fetchMailMessages: vi.fn(),
  fetchMailMessage: vi.fn(),
  sendMailMessage: vi.fn(),
}));

vi.mock("~/entities/mail/mail.api", () => mailApiMocks);

const MOCK_MAIL_SESSION_TOKEN = "mail-s1";

const server = setupServer(...handlers);

async function seedInstance() {
  const { useInstancesStore } = await import("~/entities/instance/instance.model");
  useInstancesStore.setState({
    instances: [
      {
        id: "inst-1",
        realm: "https://zulip.test",
        email: "user@example.com",
        apiKey: "key",
      },
    ],
    currentInstanceId: "inst-1",
    unreadCountsByInstance: {},
  });
}

describe("MailPage", () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  afterAll(() => server.close());

  it("renders not-configured fallback when mail API origin is empty", async () => {
    vi.stubEnv("VITE_MAIL_API_ORIGIN", "");
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");

    renderWithProviders(<MailPage />);

    expect(screen.getByRole("heading", { name: /mail/i })).toBeInTheDocument();
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it("renders mail auth dialog when API is configured", async () => {
    vi.stubEnv("VITE_MAIL_API_ORIGIN", "/mail-api");
    vi.resetModules();
    const { MailPage } = await import("./mail-page.ui");
    await seedInstance();

    renderWithProviders(<MailPage />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sign in to mail/i })).toBeInTheDocument();
  });

  it("shows mail UI after successful sign-in", async () => {
    vi.stubEnv("VITE_MAIL_API_ORIGIN", "/mail-api");
    mailApiMocks.createMailSession.mockResolvedValue({
      token: MOCK_MAIL_SESSION_TOKEN,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      email: "user@example.com",
    });
    mailApiMocks.fetchMailFolders.mockResolvedValue({
      folders: [{ path: "INBOX", name: "Inbox", unread: 1, total: 2 }],
      delimiter: ".",
    });
    mailApiMocks.fetchMailMessages.mockResolvedValue({
      messages: [
        {
          uid: 1,
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

    vi.resetModules();
    const user = userEvent.setup();
    const { MailPage } = await import("./mail-page.ui");
    await seedInstance();
    renderWithProviders(<MailPage />);

    await user.type(screen.getByLabelText(/mailbox password/i), "mail-pass");
    await user.click(screen.getByRole("button", { name: /sign in to mail/i }));

    await waitFor(() => {
      expect(mailApiMocks.createMailSession).toHaveBeenCalledWith("user@example.com", "mail-pass");
    });

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });
});
