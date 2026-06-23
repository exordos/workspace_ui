import { describe, expect, it } from "vitest";
import { resolveNextUnreadTopicRoute } from "./chat-next-unread-topic.lib";

describe("chat-next-unread-topic", () => {
  const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

  it("returns null when there are no unread topics", () => {
    const route = resolveNextUnreadTopicRoute({
      streamId: STREAM_UUID,
      currentTopic: "general",
      topics: [{ subject: "general" }, { subject: "random", badge: 0 }],
    });

    expect(route).toBeNull();
  });

  it("navigates to the first unread topic when current topic is not unread", () => {
    const route = resolveNextUnreadTopicRoute({
      streamId: STREAM_UUID,
      currentTopic: "general",
      topics: [
        { subject: "incident", badge: 3 },
        { subject: "release", badge: 1 },
      ],
    });

    expect(route).toBe(`/stream/${STREAM_UUID}/topic/incident`);
  });

  it("cycles to the next unread topic when current topic is unread", () => {
    const route = resolveNextUnreadTopicRoute({
      streamId: STREAM_UUID,
      currentTopic: "incident",
      topics: [
        { subject: "incident", badge: 3 },
        { subject: "release", badge: 1 },
        { subject: "general" },
      ],
    });

    expect(route).toBe(`/stream/${STREAM_UUID}/topic/release`);
  });

  it("wraps to the first unread topic after the last unread topic", () => {
    const route = resolveNextUnreadTopicRoute({
      streamId: STREAM_UUID,
      currentTopic: "release",
      topics: [
        { subject: "incident", badge: 3 },
        { subject: "release", badge: 1 },
      ],
    });

    expect(route).toBe(`/stream/${STREAM_UUID}/topic/incident`);
  });

  it("encodes topic name in route", () => {
    const route = resolveNextUnreadTopicRoute({
      streamId: STREAM_UUID,
      currentTopic: undefined,
      topics: [{ subject: "QA & Ops", badge: 2 }],
    });

    expect(route).toBe(`/stream/${STREAM_UUID}/topic/QA%20%26%20Ops`);
  });
});
