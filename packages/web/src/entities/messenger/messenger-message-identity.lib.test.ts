import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMessengerMessageIdentity,
  createMessengerPlacementUuid,
  normalizeMessengerMessageUuid,
} from "./messenger-message-identity.lib";

const TOPIC_UUID = "00000000-0000-0000-0000-000000000001";
const CANONICAL_MESSAGE_UUID = "00000000-0000-4000-8000-000000000002";
const PLACEMENT_UUID = "d2919e10-8c62-5b88-89e6-ed7da20fc912";

describe("messenger message identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the same placement UUIDv5 as the Workspace backend", () => {
    expect(createMessengerPlacementUuid(TOPIC_UUID, CANONICAL_MESSAGE_UUID)).toBe(PLACEMENT_UUID);
  });

  it("normalizes UUID input before deriving the placement UUID", () => {
    expect(createMessengerPlacementUuid(TOPIC_UUID.toUpperCase(), CANONICAL_MESSAGE_UUID)).toBe(
      PLACEMENT_UUID,
    );
    expect(normalizeMessengerMessageUuid(CANONICAL_MESSAGE_UUID.toUpperCase())).toBe(
      CANONICAL_MESSAGE_UUID,
    );
  });

  it("creates one canonical UUID and derives its stable placement UUID", () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(CANONICAL_MESSAGE_UUID);

    expect(createMessengerMessageIdentity(TOPIC_UUID)).toEqual({
      canonicalMessageUuid: CANONICAL_MESSAGE_UUID,
      placementUuid: PLACEMENT_UUID,
    });
    expect(randomUuid).toHaveBeenCalledOnce();
  });

  it("rejects non-hyphenated UUIDs", () => {
    expect(() => createMessengerPlacementUuid(TOPIC_UUID, "not-a-uuid")).toThrow(TypeError);
  });
});
