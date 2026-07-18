import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSummary } from "~/shared/types/provider-delivery";
import { EXTERNAL_CAPABILITY } from "./external-capabilities.lib";
import { useExternalOperationPreflight } from "./external-operation-preflight.hook";

const api = vi.hoisted(() => ({ preflight: vi.fn() }));

vi.mock("./external-accounts.api", () => ({
  preflightExternalOperation: api.preflight,
}));

const provider: ProviderSummary = {
  kind: "zulip",
  accountUuid: "11111111-1111-4111-8111-111111111111",
  externalId: "42",
  capabilities: {
    [EXTERNAL_CAPABILITY.messageSend]: { available: true, revision: 1, limits: {} },
    [EXTERNAL_CAPABILITY.fileTransfer]: { available: true, revision: 1, limits: {} },
  },
};

describe("useExternalOperationPreflight", () => {
  beforeEach(() => {
    api.preflight.mockReset();
  });

  it("keeps native Messenger sends on the direct path", async () => {
    const execute = vi.fn();
    const { result } = renderHook(() => useExternalOperationPreflight());

    await act(() =>
      result.current.runAwaitable({
        provider: null,
        action: EXTERNAL_CAPABILITY.messageSend,
        target: { type: "stream", uuid: "22222222-2222-4222-8222-222222222222" },
        execute,
      }),
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(api.preflight).not.toHaveBeenCalled();
  });

  it("fails closed before the API when the capability is unavailable", async () => {
    const execute = vi.fn();
    const { result } = renderHook(() => useExternalOperationPreflight());
    let promise: Promise<void>;
    act(() => {
      promise = result.current.runAwaitable({
        provider: { ...provider, capabilities: {} },
        action: EXTERNAL_CAPABILITY.messageSend,
        target: { type: "stream", uuid: "22222222-2222-4222-8222-222222222222" },
        execute,
      });
    });

    await expect(promise!).rejects.toThrow("capability is unavailable");
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(execute).not.toHaveBeenCalled();
    expect(api.preflight).not.toHaveBeenCalled();
  });

  it("waits for accessible confirmation before a lossy message send", async () => {
    api.preflight.mockResolvedValue({
      ok: true,
      value: {
        allowed: true,
        action: EXTERNAL_CAPABILITY.messageSend,
        target: { type: "topic", uuid: "33333333-3333-4333-8333-333333333333" },
        losses: [{ message: "Provider-specific formatting will be removed" }],
        requiresConfirmation: true,
      },
    });
    const execute = vi.fn();
    const { result } = renderHook(() => useExternalOperationPreflight());

    let promise: Promise<void>;
    act(() => {
      promise = result.current.runAwaitable({
        provider,
        action: EXTERNAL_CAPABILITY.messageSend,
        target: { type: "topic", uuid: "33333333-3333-4333-8333-333333333333" },
        execute,
      });
    });
    await waitFor(() => {
      expect(result.current.losses).toEqual(["Provider-specific formatting will be removed"]);
    });
    expect(execute).not.toHaveBeenCalled();

    act(() => result.current.confirm());
    await act(() => promise!);

    expect(execute).toHaveBeenCalledOnce();
    expect(api.preflight).toHaveBeenCalledWith({
      externalAccountUuid: provider.accountUuid,
      action: EXTERNAL_CAPABILITY.messageSend,
      target: { type: "topic", uuid: "33333333-3333-4333-8333-333333333333" },
    });
  });

  it("preflights file transfer independently and rejects cancellation", async () => {
    api.preflight.mockResolvedValue({
      ok: true,
      value: {
        allowed: true,
        action: EXTERNAL_CAPABILITY.fileTransfer,
        target: { type: "stream", uuid: "22222222-2222-4222-8222-222222222222" },
        losses: [{ message: "Attachment metadata will be reduced" }],
        requiresConfirmation: true,
      },
    });
    const execute = vi.fn();
    const { result } = renderHook(() => useExternalOperationPreflight());
    let promise: Promise<void>;

    act(() => {
      promise = result.current.runAwaitable({
        provider,
        action: EXTERNAL_CAPABILITY.fileTransfer,
        target: { type: "stream", uuid: "22222222-2222-4222-8222-222222222222" },
        execute,
      });
    });
    await waitFor(() => expect(result.current.losses).not.toBeNull());
    act(() => result.current.dismiss());

    await expect(promise!).rejects.toThrow("was cancelled");
    expect(execute).not.toHaveBeenCalled();
  });
});
