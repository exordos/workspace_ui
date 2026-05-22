import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { patchMessageAtId, patchMessagesFlags } from "./message-patch.lib";

describe("message-patch", () => {
  const messages = [
    createMessage({ id: 1, flags: [] }),
    createMessage({ id: 2, flags: ["read"] }),
    createMessage({ id: 3, flags: [] }),
  ] as MockMessage[];

  it("patchMessageAtId preserves array reference when message missing", () => {
    expect(patchMessageAtId(messages, 99, (m) => m)).toBe(messages);
  });

  it("patchMessageAtId preserves untouched row references", () => {
    const next = patchMessageAtId(messages, 2, (m) => ({ ...m, content: "edited" }));
    expect(next[0]).toBe(messages[0]);
    expect(next[2]).toBe(messages[2]);
    expect(next[1]?.content).toBe("edited");
  });

  it("patchMessagesFlags returns same reference when no ids match", () => {
    expect(patchMessagesFlags(messages, new Set([99]), "read", "add")).toBe(messages);
  });

  it("patchMessagesFlags returns same reference when flag change is a no-op", () => {
    expect(patchMessagesFlags(messages, new Set([2]), "read", "add")).toBe(messages);
    expect(patchMessagesFlags(messages, new Set([1]), "read", "remove")).toBe(messages);
  });

  it("patchMessagesFlags updates only targeted ids", () => {
    const next = patchMessagesFlags(messages, new Set([1, 3]), "read", "add");
    expect(next[0]?.flags).toContain("read");
    expect(next[1]).toBe(messages[1]);
    expect(next[2]?.flags).toContain("read");
  });
});
