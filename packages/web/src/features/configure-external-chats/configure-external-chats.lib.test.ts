import { describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { hasExternalChatCatalog, runWithConcurrency } from "./configure-external-chats.lib";

function account(capabilities: Record<string, unknown>): ExternalAccount {
  return {
    uuid: "account-uuid",
    provider: "zulip",
    settings: {
      kind: "zulip",
      serverUrl: "https://zulip.example.com",
      email: "user@example.com",
      selectionMode: "explicit",
      historyDepth: "30_days",
      defaultProjectId: "project-uuid",
    },
    credentialPresent: true,
    status: "backfill",
    liveReady: false,
    capabilities,
    safeError: null,
    desiredGeneration: 1,
    appliedGeneration: 1,
    lastProgressAt: null,
    revision: 1,
    createdAt: "2026-07-23T10:00:00Z",
    updatedAt: "2026-07-23T10:00:00Z",
    etag: '"1"',
  };
}

describe("external chat catalog behavior", () => {
  it("allows a backfill account with liveReady false when catalog is available", () => {
    expect(
      hasExternalChatCatalog(
        account({ "messenger.chat_catalog": { available: true, revision: 1, limits: {} } }),
      ),
    ).toBe(true);
  });

  it("does not infer availability from account status", () => {
    expect(hasExternalChatCatalog(account({}))).toBe(false);
  });

  it("limits batch work to three concurrent requests and keeps independent failures", async () => {
    let active = 0;
    let maximum = 0;
    const failures: number[] = [];
    const task = vi.fn(async (item: number) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (item === 4) throw new Error("failed");
    });

    await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (item) => {
      try {
        await task(item);
      } catch {
        failures.push(item);
      }
    });

    expect(maximum).toBe(3);
    expect(task).toHaveBeenCalledTimes(6);
    expect(failures).toEqual([4]);
  });
});
