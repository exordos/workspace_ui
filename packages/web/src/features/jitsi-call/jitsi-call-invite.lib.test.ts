import { describe, expect, it } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { resolveIncomingDmCallInvite } from "./jitsi-call-invite.lib";

function buildPrivateMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: 77,
    sender_id: 24,
    sender_full_name: "Slon",
    content: "https://meet.jit.si/zulip-dm-slon-123",
    timestamp: 1_700_000_000,
    type: "private",
    display_recipient: [
      { id: 24, full_name: "Slon" },
      { id: 25, full_name: "Ku" },
    ],
    ...overrides,
  };
}

describe("resolveIncomingDmCallInvite", () => {
  it("returns invite for incoming one-to-one dm call message", () => {
    const message = buildPrivateMessage({ avatar_url: "/avatar/slon.png" });

    const invite = resolveIncomingDmCallInvite(message, 25);

    expect(invite).toEqual({
      messageId: 77,
      meetingUrl: "https://meet.jit.si/zulip-dm-slon-123",
      callerName: "Slon",
      locationName: "Slon",
      avatarUrl: "/avatar/slon.png",
      timestamp: 1_700_000_000,
    });
  });

  it("normalizes empty avatar_url to undefined", () => {
    const message = buildPrivateMessage({ avatar_url: "   " });

    const invite = resolveIncomingDmCallInvite(message, 25);

    expect(invite).toMatchObject({
      messageId: 77,
      avatarUrl: undefined,
    });
  });

  it("returns null for self messages", () => {
    const message = buildPrivateMessage({ sender_id: 25 });

    expect(resolveIncomingDmCallInvite(message, 25)).toBeNull();
  });

  it("returns null for non-jitsi or non-dm-room links", () => {
    const message = buildPrivateMessage({ content: "https://example.com/room" });
    expect(resolveIncomingDmCallInvite(message, 25)).toBeNull();

    const streamRoom = buildPrivateMessage({
      content: "https://meet.jit.si/zulip-stream-general-1",
    });
    expect(resolveIncomingDmCallInvite(streamRoom, 25)).toBeNull();
  });

  it("returns null for group dm messages", () => {
    const message = buildPrivateMessage({
      display_recipient: [
        { id: 24, full_name: "Slon" },
        { id: 25, full_name: "Ku" },
        { id: 26, full_name: "Fox" },
      ],
    });

    expect(resolveIncomingDmCallInvite(message, 25)).toBeNull();
  });
});
