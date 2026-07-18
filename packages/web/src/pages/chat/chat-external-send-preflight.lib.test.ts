import { describe, expect, it, vi } from "vitest";
import { EXTERNAL_CAPABILITY } from "~/features/external-accounts/external-capabilities.lib";
import type { ProviderSummary } from "~/shared/types/provider-delivery";
import {
  executeExternalPreflightedSend,
  messageContentIncludesFileTransfer,
} from "./chat-external-send-preflight.lib";

const provider: ProviderSummary = {
  kind: "zulip",
  accountUuid: "11111111-1111-4111-8111-111111111111",
  externalId: "42",
  capabilities: {},
};
const target = { type: "topic" as const, uuid: "22222222-2222-4222-8222-222222222222" };

describe("executeExternalPreflightedSend", () => {
  it.each([
    "urn:file:11111111-1111-4111-8111-111111111111",
    "urn:image:11111111-1111-4111-8111-111111111111",
    "urn:video:11111111-1111-4111-8111-111111111111",
  ])("requires file-transfer capability when retrying content with %s", (content) => {
    expect(messageContentIncludesFileTransfer(content)).toBe(true);
  });

  it("keeps local chats regression-free without provider preflight", async () => {
    const runPreflight = vi.fn();
    const execute = vi.fn();

    await executeExternalPreflightedSend({
      provider: null,
      target,
      includesFiles: true,
      runPreflight,
      execute,
    });

    expect(runPreflight).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("preflights file transfer and message send before the optimistic callback", async () => {
    const order: string[] = [];
    const runPreflight = vi.fn(async ({ action, execute }) => {
      order.push(action);
      await execute();
    });

    await executeExternalPreflightedSend({
      provider,
      target,
      includesFiles: true,
      runPreflight,
      execute: () => {
        order.push("execute");
      },
    });

    expect(order).toEqual([
      EXTERNAL_CAPABILITY.fileTransfer,
      EXTERNAL_CAPABILITY.messageSend,
      "execute",
    ]);
  });

  it("fails closed when an external projection has no canonical target", async () => {
    const execute = vi.fn();

    await expect(
      executeExternalPreflightedSend({
        provider,
        target: null,
        includesFiles: false,
        runPreflight: vi.fn(),
        execute,
      }),
    ).rejects.toThrow("target is unavailable");
    expect(execute).not.toHaveBeenCalled();
  });
});
