import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  addMessageIdToStreamTopicIndex,
  buildStreamTopicMessageIndex,
  collectMessageIdsForStream,
  getStreamTopicMessageIds,
  patchStreamTopicMessageIndex,
  removeMessageIdFromStreamTopicIndex,
} from "./chat-list-stream-topic-index.lib";

describe("chat-list-stream-topic-index", () => {
  const MESSAGE_ID_1 = testMessageId(1);
  const MESSAGE_ID_2 = testMessageId(2);
  const MESSAGE_ID_3 = testMessageId(3);
  const MESSAGE_ID_4 = testMessageId(4);
  const MESSAGE_ID_5 = testMessageId(5);
  const MESSAGE_ID_99 = testMessageId(99);
  const locations = new Map([
    [MESSAGE_ID_1, { type: "stream" as const, stream_id: 10, topic: "bugs" }],
    [MESSAGE_ID_2, { type: "stream" as const, stream_id: 10, topic: "bugs" }],
    [MESSAGE_ID_3, { type: "stream" as const, stream_id: 10, topic: "general" }],
    [MESSAGE_ID_4, { type: "dm" as const, dmKey: "10,20" }],
  ]);

  it("buildStreamTopicMessageIndex groups stream topics", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(getStreamTopicMessageIds(index, 10, "bugs")).toEqual([MESSAGE_ID_1, MESSAGE_ID_2]);
    expect(getStreamTopicMessageIds(index, 10, "general")).toEqual([MESSAGE_ID_3]);
    expect(getStreamTopicMessageIds(index, 99, "x")).toEqual([]);
  });

  it("collectMessageIdsForStream returns all stream message ids", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(collectMessageIdsForStream(index, 10).sort()).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
      MESSAGE_ID_3,
    ]);
  });

  it("addMessageIdToStreamTopicIndex appends one id without rebuilding", () => {
    const base = buildStreamTopicMessageIndex(locations);
    const next = addMessageIdToStreamTopicIndex(base, MESSAGE_ID_99, 10, "bugs");
    expect(getStreamTopicMessageIds(next, 10, "bugs")).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
      MESSAGE_ID_99,
    ]);
  });

  it("patchStreamTopicMessageIndex applies location map diffs only", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const nextLoc = new Map(locations);
    nextLoc.delete(MESSAGE_ID_2);
    nextLoc.set(MESSAGE_ID_5, { type: "stream", stream_id: 10, topic: "general" });
    const patched = patchStreamTopicMessageIndex(index, locations, nextLoc);
    expect(getStreamTopicMessageIds(patched, 10, "bugs")).toEqual([MESSAGE_ID_1]);
    expect(getStreamTopicMessageIds(patched, 10, "general")).toEqual([MESSAGE_ID_3, MESSAGE_ID_5]);
  });

  it("removeMessageIdFromStreamTopicIndex drops empty topic buckets", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const next = removeMessageIdFromStreamTopicIndex(index, MESSAGE_ID_1, 10, "bugs");
    const next2 = removeMessageIdFromStreamTopicIndex(next, MESSAGE_ID_2, 10, "bugs");
    expect(getStreamTopicMessageIds(next2, 10, "bugs")).toEqual([]);
  });
});
