import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { createMessage } from "~/test/factories";
import { patchMessageAtId, patchMessagesFlags } from "./message-patch.lib";

describe("message-patch", () => {
  const messages = [
    createMessage({ id: "00000000-0000-4000-8000-000000000001", flags: [] }),
    createMessage({ id: "00000000-0000-4000-8000-000000000002", flags: ["read"] }),
    createMessage({ id: "00000000-0000-4000-8000-000000000003", flags: [] }),
  ] as MockMessage[];

  it("patchMessageAtId preserves array reference when message missing", () => {
    expect(patchMessageAtId(messages, "00000000-0000-4000-8000-000000000099", (m) => m)).toBe(
      messages,
    );
  });

  it("patchMessageAtId preserves untouched row references", () => {
    const next = patchMessageAtId(messages, "00000000-0000-4000-8000-000000000002", (m) => ({
      ...m,
      content: "edited",
    }));
    expect(next[0]).toBe(messages[0]);
    expect(next[2]).toBe(messages[2]);
    expect(next[1]?.content).toBe("edited");
  });

  it("patchMessagesFlags returns same reference when no ids match", () => {
    expect(
      patchMessagesFlags(
        messages,
        new Set(["00000000-0000-4000-8000-000000000099"]),
        "read",
        "add",
      ),
    ).toBe(messages);
  });

  it("patchMessagesFlags returns same reference when flag change is a no-op", () => {
    expect(
      patchMessagesFlags(
        messages,
        new Set(["00000000-0000-4000-8000-000000000002"]),
        "read",
        "add",
      ),
    ).toBe(messages);
    expect(
      patchMessagesFlags(
        messages,
        new Set(["00000000-0000-4000-8000-000000000001"]),
        "read",
        "remove",
      ),
    ).toBe(messages);
  });

  it("patchMessagesFlags updates only targeted ids", () => {
    const next = patchMessagesFlags(
      messages,
      new Set(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"]),
      "read",
      "add",
    );
    expect(next[0]?.flags).toContain("read");
    expect(next[1]).toBe(messages[1]);
    expect(next[2]?.flags).toContain("read");
  });
});
