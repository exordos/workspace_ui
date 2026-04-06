import { describe, expect, it, vi } from "vitest";
import type { MockMessage } from "~/shared/api/zulip";
import { startCallFromHeader } from "./chat-call-start.lib";
import type { CallMessageTargetParams } from "./chat-call.lib";

function createMessage(): MockMessage {
  return {
    id: 101,
    sender_id: 10,
    sender_full_name: "Tester",
    content: "https://meet.jit.si/room-1",
    timestamp: Math.floor(Date.now() / 1000),
    display_recipient: [],
    stream_id: null,
    subject: "",
    reactions: [],
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
    const input = createBaseInput({ mode: "dm", to: [25] });

    const result = await startCallFromHeader(input);

    expect(result).toEqual({ ok: true, error: null });
    expect(input.sendMessage).toHaveBeenCalledTimes(1);
    // Проверяем, что в чат сначала уходит call-сообщение, а затем открывается модалка.
    expect(input.appendMessageToStore).toHaveBeenCalledTimes(1);
    expect(input.openModal).toHaveBeenCalledWith("https://meet.jit.si/room-1", "Slon");
  });

  it("does not open modal when send fails in one-to-one dm", async () => {
    const input = createBaseInput({ mode: "dm", to: [25] });
    input.sendMessage.mockRejectedValueOnce(new Error("network down"));

    const result = await startCallFromHeader(input);

    expect(result).toEqual({ ok: false, error: "network down" });
    expect(input.appendMessageToStore).not.toHaveBeenCalled();
    // При ошибке отправки нельзя открывать модалку — иначе UX расходится с реальным состоянием.
    expect(input.openModal).not.toHaveBeenCalled();
  });

  it("does not auto-open modal for group dm or stream", async () => {
    const streamInput = createBaseInput({
      mode: "stream",
      stream: "general",
      subject: "topic",
      streamId: 11,
    });
    streamInput.isOneToOneDm = false;

    const result = await startCallFromHeader(streamInput);

    expect(result).toEqual({ ok: true, error: null });
    expect(streamInput.appendMessageToStore).toHaveBeenCalledTimes(1);
    expect(streamInput.openModal).not.toHaveBeenCalled();
  });
});
