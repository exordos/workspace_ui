import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createExternalAccount } from "~/shared/api/messenger-external-accounts.api";
import { telegramAuth } from "~/shared/api/messenger-telegram.api";
import { useConnectTelegramAccount } from "./connect-telegram-account.hook";

vi.mock("~/entities/external-account/external-account-sync.lib", () => ({
  refreshExternalAccounts: vi.fn(),
}));
vi.mock("~/shared/api/messenger-external-accounts.api", () => ({
  createExternalAccount: vi.fn().mockResolvedValue({}),
  getExternalAccount: vi.fn(),
  getExternalAccounts: vi.fn().mockResolvedValue([]),
  updateExternalAccount: vi.fn(),
}));
vi.mock("~/shared/api/messenger-telegram.api", () => ({ telegramAuth: vi.fn() }));
const runtime: WorkspaceRuntimeContext = {
  accountId: "workspace-account",
  instanceId: "instance",
  organizationId: "organization",
  projectId: "project",
  userUuid: "user",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "synthetic",
  runtimeGeneration: 1,
};
afterEach(() => vi.clearAllMocks());
it("cancels only its own QR generation when the form closes", async () => {
  vi.mocked(telegramAuth).mockResolvedValue({
    state: "qr_pending",
    generation: "attempt-one",
    qr_url: "tg://login?token=synthetic",
    dialogs: [],
  });
  const { result, unmount } = renderHook(() => useConnectTelegramAccount(runtime, null));
  await act(async () => result.current.connect());
  await waitFor(() => expect(result.current.snapshot?.generation).toBe("attempt-one"));
  unmount();
  expect(telegramAuth).toHaveBeenLastCalledWith(expect.anything(), expect.any(String), {
    operation: "cancel",
    generation: "attempt-one",
  });
  expect(createExternalAccount).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      provider: "telegram",
      settings: {},
    }),
  );
});
it("does not start login if the form closes before account creation returns", async () => {
  let complete: ((value: Awaited<ReturnType<typeof createExternalAccount>>) => void) | undefined;
  vi.mocked(createExternalAccount).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const { result, unmount } = renderHook(() => useConnectTelegramAccount(runtime, null));
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = result.current.connect();
    await Promise.resolve();
  });
  unmount();
  await act(async () => {
    complete?.({
      account: {
        uuid: "unused",
        provider: "telegram",
        settings: {},
        status: "new",
        error_description: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      etag: undefined,
    });
    await pending;
  });
  expect(telegramAuth).not.toHaveBeenCalled();
});
