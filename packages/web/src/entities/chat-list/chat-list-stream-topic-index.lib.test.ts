import { describe, expect, it } from "vitest";
import {
  buildStreamTopicMessageIndex,
  collectMessageIdsForStream,
  getStreamTopicMessageIds,
} from "./chat-list-stream-topic-index.lib";

describe("chat-list-stream-topic-index", () => {
  const locations = new Map([
    [1, { type: "stream" as const, stream_id: 10, topic: "bugs" }],
    [2, { type: "stream" as const, stream_id: 10, topic: "bugs" }],
    [3, { type: "stream" as const, stream_id: 10, topic: "general" }],
    [4, { type: "dm" as const, dmKey: "10,20" }],
  ]);

  it("buildStreamTopicMessageIndex groups stream topics", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(getStreamTopicMessageIds(index, 10, "bugs")).toEqual([1, 2]);
    expect(getStreamTopicMessageIds(index, 10, "general")).toEqual([3]);
    expect(getStreamTopicMessageIds(index, 99, "x")).toEqual([]);
  });

  it("collectMessageIdsForStream returns all stream message ids", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(collectMessageIdsForStream(index, 10).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
