import { afterEach, describe, expect, it, vi } from "vitest";
import { createMessageId, isMessageId } from "./message-id.lib";

describe("message-id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a UUID when crypto.randomUUID is available", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    vi.stubGlobal("crypto", {
      randomUUID: () => uuid,
    });

    expect(createMessageId()).toBe(uuid);
  });

  it("falls back to crypto.getRandomValues when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index;
        }
        return bytes;
      },
    });

    const id = createMessageId();

    expect(isMessageId(id)).toBe(true);
    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
