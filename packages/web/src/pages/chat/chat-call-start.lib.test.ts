import { describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { startCallFromHeader } from "./chat-call-start.lib";
import type { CallMessageTargetParams } from "./chat-call.lib";

const streamUuid = "22222222-2222-4222-8222-222222222222";

function createMessage(): MockMessage {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    sender_id: 10,
    sender_full_name: "Tester",
    content: "https://meet.jit.si/room-1",
    timestamp: Math.floor(Date.now() / 1000),
    display_recipient: [],
    stream_uuid: null,
    subject: "",
    reactions: {},
    flags: [],
  };
}

function createBaseInput(target: CallMessageTargetParams) {
  const appendMessageToStore = vi.fn();
  const openModal = vi.fn();
  const sendMessage = vi.fn().mockResolvedValue(createMessage());
  return {
    target,
    currentUserId: 10,
    buildCurrentCallLink: () => "https://meet.jit.si/room-1",
    isOneToOneDm: true,
    callRoomChatLabel: "Slon",
    fallbackDmPartnerLabel: "Partner",
    currentUserLabel: "You",
    sendMessage,
    appendMessageToStore,
    openModal,
    resolveErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "unknown"),
  };
}

describe("startCallFromHeader", () => {
  it("opens modal for one-to-one dm only after successful send", async () => {
    const input = createBaseInput({ mode: "dm", to: [25], streamUuid });

    const result = await startCallFromHeader(input);

    expect(result).toEqual({ ok: true, error: null });
    expect(input.sendMessage).toHaveBeenCalledTimes(1);
    expect(input.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        streamUuid,
        content: "https://meet.jit.si/room-1",
      }),
    );
    // Assert: call message is sent first, then the modal opens.
    expect(input.appendMessageToStore).toHaveBeenCalledTimes(1);
    expect(input.openModal).toHaveBeenCalledWith("https://meet.jit.si/room-1", "Slon");
  });

  it("does not open modal when send fails in one-to-one dm", async () => {
    const input = createBaseInput({ mode: "dm", to: [25], streamUuid });
    input.sendMessage.mockRejectedValueOnce(new Error("network down"));

    const result = await startCallFromHeader(input);

    expect(result).toEqual({ ok: false, error: "network down" });
    expect(input.appendMessageToStore).not.toHaveBeenCalled();
    // On send failure, do not open the modal — UX must match actual state.
    expect(input.openModal).not.toHaveBeenCalled();
  });

  it("does not auto-open modal for group dm or stream", async () => {
    const streamInput = createBaseInput({
      mode: "stream",
      stream: "general",
      subject: "topic",
      streamUuid,
    });
    streamInput.isOneToOneDm = false;

    const result = await startCallFromHeader(streamInput);

    expect(result).toEqual({ ok: true, error: null });
    expect(streamInput.appendMessageToStore).toHaveBeenCalledTimes(1);
    expect(streamInput.openModal).not.toHaveBeenCalled();
  });
});
