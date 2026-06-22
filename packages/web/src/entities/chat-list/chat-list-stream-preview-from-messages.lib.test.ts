import { describe, expect, it } from "vitest";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { createMessage } from "~/test/factories";

function streamMessage(overrides: Parameters<typeof createMessage>[0] = {}): WorkspaceRawMessage {
  return createMessage(overrides);
}
import {
  filterStreamMessagesForSidebar,
  mergeStreamSidebarPreviewsFromMessages,
} from "./chat-list-stream-preview-from-messages.lib";

function streamShell(streamUuid: string, ts: number): StreamEntryInternal {
  return {
    streamUuid,
    name: `channel-${streamUuid}`,
    lastMessage: "",
    time: "",
    ts,
    topics: new Map(),
  };
}

describe("chat-list-stream-preview-from-messages.lib", () => {
  it("filterStreamMessagesForSidebar keeps only stream messages", () => {
    const stream = streamMessage({ type: "stream", stream_id: 1, subject: "general" });
    const dm = streamMessage({
      type: "private",
      display_recipient: [{ id: 1, email: "a@x.com", full_name: "A" }],
    });
    expect(filterStreamMessagesForSidebar([stream, dm])).toEqual([stream]);
  });

  it("mergeStreamSidebarPreviewsFromMessages updates preview without changing unread", () => {
    const streamId = "00000000-0000-4000-8000-000000000010";
    const topic = "general";
    const existing = streamShell(streamId, 100);
    existing.topics.set(topic, {
      subject: topic,
      lastMessage: "",
      time: "",
      ts: 100,
      unreadCount: 42,
    });
    const streamsMap = new Map([[streamId, existing]]);

    const msg = streamMessage({
      id: 200,
      type: "stream",
      stream_uuid: streamId,
      subject: topic,
      content: "Hello channel",
      timestamp: 150,
      flags: ["read"],
    });

    const next = mergeStreamSidebarPreviewsFromMessages(streamsMap, [msg]);
    const entry = next.get(streamId)!;
    const topicEntry = entry.topics.get(topic)!;
    expect(topicEntry.lastMessage).toContain("Hello");
    expect(topicEntry.unreadCount).toBe(42);
    expect(entry.lastMessage).toContain("Hello");
  });

  it("does not lower sidebar stream unread when batch has only read stream messages", () => {
    const streamId = "00000000-0000-4000-8000-000000000020";
    const existing = streamShell(streamId, 50);
    existing.topics.set("t", {
      subject: "t",
      lastMessage: "",
      time: "",
      ts: 50,
      unreadCount: 100_000,
    });
    const streamsMap = new Map([[streamId, existing]]);

    const readMsg = streamMessage({
      id: 99,
      type: "stream",
      stream_uuid: streamId,
      subject: "t",
      content: "read only",
      timestamp: 60,
      flags: ["read"],
    });

    mergeStreamSidebarPreviewsFromMessages(streamsMap, [readMsg]);
    expect(streamsMap.get(streamId)!.topics.get("t")!.unreadCount).toBe(100_000);
  });
});
