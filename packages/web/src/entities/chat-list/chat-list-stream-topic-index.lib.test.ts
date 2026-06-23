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
  const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
  const UNKNOWN_STREAM_UUID = "00000000-0000-4000-8000-000000000099";
  const locations = new Map([
    [MESSAGE_ID_1, { type: "stream" as const, streamUuid: STREAM_UUID, topic: "bugs" }],
    [MESSAGE_ID_2, { type: "stream" as const, streamUuid: STREAM_UUID, topic: "bugs" }],
    [MESSAGE_ID_3, { type: "stream" as const, streamUuid: STREAM_UUID, topic: "general" }],
    [MESSAGE_ID_4, { type: "dm" as const, dmKey: "10,20" }],
  ]);

  it("buildStreamTopicMessageIndex groups stream topics", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(getStreamTopicMessageIds(index, STREAM_UUID, "bugs")).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
    ]);
    expect(getStreamTopicMessageIds(index, STREAM_UUID, "general")).toEqual([MESSAGE_ID_3]);
    expect(getStreamTopicMessageIds(index, UNKNOWN_STREAM_UUID, "x")).toEqual([]);
  });

  it("collectMessageIdsForStream returns all stream message ids", () => {
    const index = buildStreamTopicMessageIndex(locations);
    expect(collectMessageIdsForStream(index, STREAM_UUID).sort()).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
      MESSAGE_ID_3,
    ]);
  });

  it("addMessageIdToStreamTopicIndex appends one id without rebuilding", () => {
    const base = buildStreamTopicMessageIndex(locations);
    const next = addMessageIdToStreamTopicIndex(base, MESSAGE_ID_99, STREAM_UUID, "bugs");
    expect(getStreamTopicMessageIds(next, STREAM_UUID, "bugs")).toEqual([
      MESSAGE_ID_1,
      MESSAGE_ID_2,
      MESSAGE_ID_99,
    ]);
  });

  it("patchStreamTopicMessageIndex applies location map diffs only", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const nextLoc = new Map(locations);
    nextLoc.delete(MESSAGE_ID_2);
    nextLoc.set(MESSAGE_ID_5, { type: "stream", streamUuid: STREAM_UUID, topic: "general" });
    const patched = patchStreamTopicMessageIndex(index, locations, nextLoc);
    expect(getStreamTopicMessageIds(patched, STREAM_UUID, "bugs")).toEqual([MESSAGE_ID_1]);
    expect(getStreamTopicMessageIds(patched, STREAM_UUID, "general")).toEqual([
      MESSAGE_ID_3,
      MESSAGE_ID_5,
    ]);
  });

  it("removeMessageIdFromStreamTopicIndex drops empty topic buckets", () => {
    const index = buildStreamTopicMessageIndex(locations);
    const next = removeMessageIdFromStreamTopicIndex(index, MESSAGE_ID_1, STREAM_UUID, "bugs");
    const next2 = removeMessageIdFromStreamTopicIndex(next, MESSAGE_ID_2, STREAM_UUID, "bugs");
    expect(getStreamTopicMessageIds(next2, STREAM_UUID, "bugs")).toEqual([]);
  });
});
