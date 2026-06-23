import { describe, expect, it } from "vitest";
import { buildReadFallbackContext, resolveMessageListScrollKey } from "./chat-page.lib";

/**
 * Characterization tests for chat-page-forward-hydration hook behavior
 * without importing the full messenger-messages dependency graph (OOM in Vitest).
 */
describe("chat-page-forward-hydration (characterization)", () => {
  it("documents forward hydration resolves stream context for open chat", () => {
    const context = buildReadFallbackContext({
      isDmView: false,
      activeDmUserIds: null,
      currentUserId: 7,
      activeStreamId: "11111111-1111-4111-8111-111111111111",
      activeTopic: "bugs",
    });
    expect(context).toEqual({
      type: "stream",
      streamId: "11111111-1111-4111-8111-111111111111",
      topic: "bugs",
    });
  });
});

describe("resolveMessageListScrollKey", () => {
  it("keeps stream topic scroll identity stable when only the topic display name changes", () => {
    const streamId = "11111111-1111-4111-8111-111111111111";
    const topicUuid = "22222222-2222-4222-8222-222222222222";

    const beforeRename = resolveMessageListScrollKey({
      isDmView: false,
      activeDmUserIds: null,
      activeStreamId: streamId,
      activeStream: "general",
      activeTopicUuid: topicUuid,
      activeTopic: "incident",
    });
    const afterRename = resolveMessageListScrollKey({
      isDmView: false,
      activeDmUserIds: null,
      activeStreamId: streamId,
      activeStream: "general",
      activeTopicUuid: topicUuid,
      activeTopic: "postmortem",
    });

    expect(beforeRename).toBe(`${streamId}|${topicUuid}`);
    expect(afterRename).toBe(beforeRename);
  });
});
