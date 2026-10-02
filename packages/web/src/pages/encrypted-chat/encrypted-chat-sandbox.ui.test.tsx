import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { createDevChatE2eeSandbox } from "~/features/chat-e2ee-dev-sandbox/chat-e2ee-dev-sandbox.lib";
import type * as SandboxModule from "~/features/chat-e2ee-dev-sandbox/chat-e2ee-dev-sandbox.lib";
import { EncryptedChatSandbox } from "./encrypted-chat-sandbox.ui";

vi.mock("~/i18n/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("~/features/chat-e2ee-dev-sandbox/chat-e2ee-dev-sandbox.lib", async (importOriginal) => {
  const original = await importOriginal<typeof SandboxModule>();
  return { ...original, createDevChatE2eeSandbox: vi.fn() };
});

function session(
  accountId = "a",
  organizationOrigin = "http://127.0.0.1:23190",
): WorkspaceAuthSession {
  return {
    accountId,
    instanceId: "i",
    organizationId: "o",
    organizationOrigin,
    projectId: "p",
    userUuid: "u",
    accessToken: "fixture-session",
    runtimeGeneration: accountId === "a" ? 1 : 2,
    login: "fixture",
    profile: { uuid: "u", username: "fixture", firstName: null, lastName: null, email: null },
  };
}

function sandboxFixture() {
  let disposed = false;
  return {
    initialize: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve()),
    requestKey: vi.fn(() => Promise.resolve()),
    respondToRequest: vi.fn(() => Promise.resolve()),
    sendFixture: vi.fn(() => Promise.resolve()),
    switchDevice: vi.fn(() => Promise.resolve()),
    getSnapshot: vi.fn(() => ({
      streamUuid: "fixture-stream",
      device: "issuer" as const,
      state: null,
      messages: [],
    })),
    dispose: vi.fn(() => {
      disposed = true;
    }),
    isCurrent: vi.fn(() => !disposed),
  };
}

describe("EncryptedChatSandbox", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.mocked(createDevChatE2eeSandbox).mockReset();
    useWorkspaceAuthStore.setState({ sessions: [session()], currentAccountId: "a" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
  });

  it("shows the insecure marker and creates no stream until an explicit click", async () => {
    const sandbox = sandboxFixture();
    vi.mocked(createDevChatE2eeSandbox).mockReturnValue(sandbox);
    render(<EncryptedChatSandbox />);
    expect(screen.getByRole("note")).toHaveTextContent("e2eeSandbox.warning");
    expect(sandbox.initialize).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "e2eeSandbox.create" }));
    expect(sandbox.initialize).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "e2eeSandbox.create" })).toBeDisabled(),
    );
  });

  it.each(["https://remote.example.com", "http://127.0.0.1:23190/api"])(
    "never offers mock operations for rejected backend %s",
    (origin) => {
      useWorkspaceAuthStore.setState({ sessions: [session("a", origin)] });
      render(<EncryptedChatSandbox />);
      expect(screen.getByRole("status")).toHaveTextContent("e2eeSandbox.unavailable");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(createDevChatE2eeSandbox).not.toHaveBeenCalled();
    },
  );

  it("disposes the old scope and suppresses its late React update after an account switch", async () => {
    const first = sandboxFixture();
    const second = sandboxFixture();
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    first.initialize.mockImplementation(() => pending);
    vi.mocked(createDevChatE2eeSandbox).mockReturnValueOnce(first).mockReturnValueOnce(second);
    render(<EncryptedChatSandbox />);
    await userEvent.click(screen.getByRole("button", { name: "e2eeSandbox.create" }));
    await act(async () => {
      useWorkspaceAuthStore.setState({ sessions: [session("b")], currentAccountId: "b" });
      await Promise.resolve();
    });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete();
      await pending;
    });
    expect(first.getSnapshot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "e2eeSandbox.create" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
