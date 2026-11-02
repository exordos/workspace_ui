import { describe, expect, it } from "vitest";
import {
  isEncryptedReplySourceAffectedByKeyChange,
  isEncryptedReplySourceCurrent,
} from "./chat-page-encrypted-reply.lib";

const source = {
  uuid: "message-a",
  projectId: "project",
  authorUuid: "author",
  streamUuid: "stream",
  topicUuid: "topic",
  payload: { kind: "e2ee" as const, content: "ciphertext", keyUuid: "key-a" },
};
const change = {
  kind: "removed" as const,
  ownerKey: "owner",
  deviceId: "device",
  streamUuid: "stream",
  keyUuid: "key-a",
};

describe("encrypted reply source validity", () => {
  it("invalidates only a source whose message identity or protected content changed", () => {
    expect(isEncryptedReplySourceCurrent(source, { ...source })).toBe(true);
    expect(isEncryptedReplySourceCurrent(source, null)).toBe(false);
    expect(isEncryptedReplySourceCurrent(source, { ...source, uuid: "message-b" })).toBe(false);
    expect(isEncryptedReplySourceCurrent(source, { ...source, authorUuid: "other" })).toBe(false);
    expect(isEncryptedReplySourceCurrent(source, { ...source, topicUuid: "other" })).toBe(false);
    expect(
      isEncryptedReplySourceCurrent(source, {
        ...source,
        payload: { ...source.payload, content: "changed" },
      }),
    ).toBe(false);
    expect(
      isEncryptedReplySourceCurrent(source, {
        ...source,
        payload: { ...source.payload, keyUuid: "key-b" },
      }),
    ).toBe(false);
  });
  it("invalidates the matching key on removal or replacement, including an unscoped reset", () => {
    expect(isEncryptedReplySourceAffectedByKeyChange(source, "owner", change)).toBe(true);
    expect(
      isEncryptedReplySourceAffectedByKeyChange(source, "owner", { ...change, kind: "updated" }),
    ).toBe(true);
    expect(isEncryptedReplySourceAffectedByKeyChange(source, "owner", undefined)).toBe(true);
    expect(
      isEncryptedReplySourceAffectedByKeyChange(source, "owner", { ...change, keyUuid: "key-b" }),
    ).toBe(false);
    expect(isEncryptedReplySourceAffectedByKeyChange(source, "other", change)).toBe(false);
  });
});
