/**
 * Tests for the mute/unmute feature.
 *
 * Verifies that channels and topics can be muted/unmuted, and that
 * the mute state is correctly queried for notification filtering
 * and sidebar display.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMuteStore, topicKey } from "./mute-chat.model";

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    post: vi.fn(),
  },
}));

describe("useMuteStore", () => {
  afterEach(() => {
    useMuteStore.getState().clear();
  });

  // Stream (channel) muting
  describe("stream muting", () => {
    // Muting a stream should add its ID to the muted set
    it("muteStream adds stream to muted set", () => {
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(true);
    });

    // Unmuting should remove it
    it("unmuteStream removes stream from muted set", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteStream(10);
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
    });

    // Streams that were never muted should return false
    it("isStreamMuted returns false for unknown stream", () => {
      expect(useMuteStore.getState().isStreamMuted(999)).toBe(false);
    });

    // Muting the same stream twice should be idempotent
    it("muteStream is idempotent", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().mutedStreamIds.size).toBe(1);
    });
  });

  // Topic muting
  describe("topic muting", () => {
    // Muting a topic should add the composite key to the muted set
    it("muteTopic adds topic to muted set", () => {
      useMuteStore.getState().muteTopic(10, "announcements");
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(true);
    });

    // Unmuting should remove it
    it("unmuteTopic removes topic from muted set", () => {
      useMuteStore.getState().muteTopic(10, "announcements");
      useMuteStore.getState().unmuteTopic(10, "announcements");
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
    });

    // Topic muting is independent of stream muting
    it("topic mute is independent of stream mute", () => {
      useMuteStore.getState().muteTopic(10, "off-topic");
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(10, "off-topic")).toBe(true);
    });
  });

  // Effective mute (combines stream + topic)
  describe("isEffectivelyMuted", () => {
    // If the stream is muted, all topics are effectively muted
    it("returns true when stream is muted", () => {
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().isEffectivelyMuted(10, "any-topic")).toBe(true);
    });

    // Even if stream is muted, an explicitly unmuted topic should not be muted
    it("returns false when stream is muted but topic is explicitly unmuted", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteTopic(10, "important");
      expect(useMuteStore.getState().isEffectivelyMuted(10, "important")).toBe(false);
    });

    // If the topic itself is muted (not the stream), it should be effectively muted
    it("returns true when topic is muted even if stream is not", () => {
      useMuteStore.getState().muteTopic(10, "spam");
      expect(useMuteStore.getState().isEffectivelyMuted(10, "spam")).toBe(true);
    });

    // Neither stream nor topic muted → not muted
    it("returns false when nothing is muted", () => {
      expect(useMuteStore.getState().isEffectivelyMuted(10, "general")).toBe(false);
    });
  });

  // Bulk initialization from server data
  describe("setFromServer", () => {
    it("sets muted streams and topics from server data", () => {
      useMuteStore.getState().setFromServer({
        mutedStreamIds: [10, 20],
        mutedTopics: [{ streamId: 10, topic: "spam" }],
        unmutedTopics: [{ streamId: 20, topic: "important" }],
      });

      expect(useMuteStore.getState().isStreamMuted(10)).toBe(true);
      expect(useMuteStore.getState().isStreamMuted(20)).toBe(true);
      expect(useMuteStore.getState().isTopicMuted(10, "spam")).toBe(true);
      expect(useMuteStore.getState().isEffectivelyMuted(20, "important")).toBe(false);
    });
  });

  // Clear resets everything
  describe("clear", () => {
    it("resets all mute state", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().muteTopic(10, "x");
      useMuteStore.getState().clear();
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(10, "x")).toBe(false);
    });
  });
});

describe("topicKey", () => {
  // The composite key format should be stable for Map/Set lookups
  it("creates a stable composite key", () => {
    expect(topicKey(42, "hello")).toBe("42:hello");
  });
});

// Mute API — calls Zulip endpoints to mute/unmute streams and topics.
describe("mute-chat API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockOk = {
    ok: true,
    status: 200,
    data: {},
    headers: new Headers(),
    raw: new Response(),
    durationMs: 20,
  };

  const mockFail = {
    ok: false,
    status: 400,
    data: null,
    headers: new Headers(),
    raw: new Response(),
    durationMs: 10,
  };

  describe("setStreamMuted", () => {
    it("sends mute request with correct subscription data", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamMuted } = await import("./mute-chat.api");
      const result = await setStreamMuted(10, true);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/users/me/subscriptions/properties", {
        subscription_data: JSON.stringify([{ stream_id: 10, property: "is_muted", value: true }]),
      });
    });

    it("sends unmute request with value=false", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamMuted } = await import("./mute-chat.api");
      await setStreamMuted(10, false);

      expect(zulipApi.post).toHaveBeenCalledWith(
        "/users/me/subscriptions/properties",
        expect.objectContaining({
          subscription_data: JSON.stringify([
            { stream_id: 10, property: "is_muted", value: false },
          ]),
        }),
      );
    });

    it("returns false on API failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockFail);

      const { setStreamMuted } = await import("./mute-chat.api");
      expect(await setStreamMuted(10, true)).toBe(false);
    });

    it("returns false on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockRejectedValue(new Error("Timeout"));

      const { setStreamMuted } = await import("./mute-chat.api");
      expect(await setStreamMuted(10, true)).toBe(false);
    });
  });

  describe("setTopicVisibility", () => {
    it("sends topic visibility policy with correct params", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicVisibility } = await import("./mute-chat.api");
      const result = await setTopicVisibility(10, "announcements", 1);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "announcements",
        visibility_policy: "1",
      });
    });

    it("returns false on API failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockFail);

      const { setTopicVisibility } = await import("./mute-chat.api");
      expect(await setTopicVisibility(10, "spam", 1)).toBe(false);
    });

    it("returns false on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockRejectedValue(new Error("Offline"));

      const { setTopicVisibility } = await import("./mute-chat.api");
      expect(await setTopicVisibility(10, "spam", 1)).toBe(false);
    });
  });

  // Convenience wrappers delegate to the core functions.
  describe("muteStream / unmuteStream", () => {
    it("muteStream calls setStreamMuted with true", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { muteStream } = await import("./mute-chat.api");
      expect(await muteStream(42)).toBe(true);

      const body = vi.mocked(zulipApi.post).mock.calls[0]![1];
      const data = JSON.parse(body.subscription_data!) as { value: boolean }[];
      expect(data[0]!.value).toBe(true);
    });

    it("unmuteStream calls setStreamMuted with false", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { unmuteStream } = await import("./mute-chat.api");
      expect(await unmuteStream(42)).toBe(true);

      const body = vi.mocked(zulipApi.post).mock.calls[0]![1];
      const data = JSON.parse(body.subscription_data!) as { value: boolean }[];
      expect(data[0]!.value).toBe(false);
    });
  });

  describe("muteTopic / unmuteTopic", () => {
    it("muteTopic sends MUTED policy (1)", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { muteTopic } = await import("./mute-chat.api");
      expect(await muteTopic(10, "off-topic")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "off-topic",
        visibility_policy: "1",
      });
    });

    it("unmuteTopic sends INHERIT policy (0)", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { unmuteTopic } = await import("./mute-chat.api");
      expect(await unmuteTopic(10, "off-topic")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "off-topic",
        visibility_policy: "0",
      });
    });
  });
});
