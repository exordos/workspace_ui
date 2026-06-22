/**
 * Tests for the draft API facade.
 */
import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import { createDraft, deleteDraftOnServer, fetchDrafts, updateDraftOnServer } from "./draft.api";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";

describe("fetchDrafts", () => {
  it("returns an empty local-only server snapshot", async () => {
    await expect(fetchDrafts()).resolves.toEqual([]);
  });
});

describe("createDraft", () => {
  it("validates input and returns null because server drafts are unsupported", async () => {
    await expect(
      createDraft({ type: "stream", to: [STREAM_UUID], topic: "test", content: "hello" }),
    ).resolves.toBeNull();
  });

  it("throws for invalid draft type", async () => {
    await expect(
      createDraft({ type: "invalid" as "stream", to: [STREAM_UUID], topic: "test", content: "x" }),
    ).rejects.toThrow();
  });

  it("throws for empty to array", async () => {
    await expect(
      createDraft({ type: "stream", to: [], topic: "test", content: "x" }),
    ).rejects.toThrow(/non-empty array/);
  });

  it("validates stream UUIDs for stream drafts", async () => {
    await expect(
      createDraft({ type: "stream", to: [10], topic: "test", content: "x" }),
    ).rejects.toThrow(/Invalid streamUuid/);
  });

  it("validates user IDs for private drafts", async () => {
    await expect(
      createDraft({ type: "private", to: [0], topic: "", content: "x" }),
    ).rejects.toThrow(/Invalid userId/);
  });
});

describe("updateDraftOnServer", () => {
  it("validates input and returns false because server drafts are unsupported", async () => {
    await expect(
      updateDraftOnServer(testMessageId(1), {
        type: "private",
        to: [42],
        topic: "",
        content: "updated",
      }),
    ).resolves.toBe(false);
  });

  it("throws for invalid draft id", async () => {
    await expect(
      updateDraftOnServer(0 as never, {
        type: "stream",
        to: [STREAM_UUID],
        topic: "test",
        content: "x",
      }),
    ).rejects.toThrow(/Invalid messageId/);
  });
});

describe("deleteDraftOnServer", () => {
  it("validates id and returns false because server drafts are unsupported", async () => {
    await expect(deleteDraftOnServer(testMessageId(1))).resolves.toBe(false);
  });

  it("throws for invalid draft id", async () => {
    await expect(deleteDraftOnServer(0 as never)).rejects.toThrow(/Invalid messageId/);
  });
});
