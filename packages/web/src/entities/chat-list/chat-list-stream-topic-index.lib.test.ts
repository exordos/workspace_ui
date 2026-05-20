import { describe, expect, it } from "vitest";
import {
  addMessageIdToStreamTopicIndex,
  buildStreamTopicMessageIndex,
  collectMessageIdsForStream,
  getStreamTopicMessageIds,
  patchStreamTopicMessageIndex,
  removeMessageIdFromStreamTopicIndex,
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

  it("addMessageIdToStreamTopicIndex appends one id without rebuilding", () => {
    const base = buildStreamTopicMessageIndex(locations);
    const next = addMessageIdToStreamTopicIndex(base, 99, 10, "bugs");
    expect(getStreamTopicMessageIds(next, 10, "bugs")).toEqual([1, 2, 99]);
  });

  it("patchStreamTopicMessageIndex applies location map diffs only", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const nextLoc = new Map(locations);
    nextLoc.delete(2);
    nextLoc.set(5, { type: "stream", stream_id: 10, topic: "general" });
    const patched = patchStreamTopicMessageIndex(index, locations, nextLoc);
    expect(getStreamTopicMessageIds(patched, 10, "bugs")).toEqual([1]);
    expect(getStreamTopicMessageIds(patched, 10, "general")).toEqual([3, 5]);
  });

  it("removeMessageIdFromStreamTopicIndex drops empty topic buckets", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const next = removeMessageIdFromStreamTopicIndex(index, 1, 10, "bugs");
    const next2 = removeMessageIdFromStreamTopicIndex(next, 2, 10, "bugs");
    expect(getStreamTopicMessageIds(next2, 10, "bugs")).toEqual([]);
  });
});
