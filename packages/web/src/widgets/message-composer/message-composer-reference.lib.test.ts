import { describe, expect, it } from "vitest";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import {
  formatWorkspaceComposerReference,
  getWorkspaceComposerReferenceSuggestions,
  insertWorkspaceComposerReference,
  replaceWorkspaceComposerLinks,
} from "./message-composer-reference.lib";

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";

function createStream(): MessengerStream {
  return {
    uuid: STREAM_UUID,
    projectId: "project-uuid",
    ownerUuid: "owner-uuid",
    userUuid: "user-uuid",
    role: "member",
    notificationMode: "all_messages",
    name: "Engineering",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "",
    updatedAt: "",
  };
}

function createTopic(): MessengerTopic {
  return {
    uuid: TOPIC_UUID,
    projectId: "project-uuid",
    streamUuid: STREAM_UUID,
    userUuid: "user-uuid",
    name: "Releases",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("message composer Workspace references", () => {
  it("builds stream and topic suggestions from the existing store indexes", () => {
    const stream = createStream();
    const topic = createTopic();

    expect(
      getWorkspaceComposerReferenceSuggestions({
        streamIds: [STREAM_UUID],
        streamsById: { [STREAM_UUID]: stream },
        topicIds: [TOPIC_UUID],
        topicsById: { [TOPIC_UUID]: topic },
        query: "release",
      }),
    ).toEqual([
      {
        kind: "topic",
        topicUuid: TOPIC_UUID,
        streamUuid: STREAM_UUID,
        streamName: "Engineering",
        topicName: "Releases",
      },
    ]);
  });

  it("deduplicates stream and topic UUIDs without changing first-match order", () => {
    const secondStreamUuid = "33333333-3333-4333-8333-333333333333";
    const secondTopicUuid = "44444444-4444-4444-8444-444444444444";
    const secondStream = { ...createStream(), uuid: secondStreamUuid, name: "Product" };
    const secondTopic = {
      ...createTopic(),
      uuid: secondTopicUuid,
      streamUuid: secondStreamUuid,
      name: "Planning",
    };

    expect(
      getWorkspaceComposerReferenceSuggestions({
        streamIds: [secondStreamUuid, STREAM_UUID, secondStreamUuid],
        streamsById: {
          [STREAM_UUID]: createStream(),
          [secondStreamUuid]: secondStream,
        },
        topicIds: [secondTopicUuid, TOPIC_UUID, secondTopicUuid],
        topicsById: {
          [TOPIC_UUID]: createTopic(),
          [secondTopicUuid]: secondTopic,
        },
      }),
    ).toEqual([
      {
        kind: "stream",
        streamUuid: secondStreamUuid,
        streamName: "Product",
      },
      {
        kind: "stream",
        streamUuid: STREAM_UUID,
        streamName: "Engineering",
      },
      {
        kind: "topic",
        topicUuid: secondTopicUuid,
        streamUuid: secondStreamUuid,
        streamName: "Product",
        topicName: "Planning",
      },
      {
        kind: "topic",
        topicUuid: TOPIC_UUID,
        streamUuid: STREAM_UUID,
        streamName: "Engineering",
        topicName: "Releases",
      },
    ]);
  });

  it("formats a stream with a stream URN and a topic with only its topic UUID", () => {
    const streamReference = {
      kind: "stream" as const,
      streamUuid: STREAM_UUID,
      streamName: "Engineering",
    };
    const topicReference = {
      kind: "topic" as const,
      topicUuid: TOPIC_UUID,
      streamUuid: STREAM_UUID,
      streamName: "Engineering",
      topicName: "Releases",
    };

    expect(formatWorkspaceComposerReference(streamReference)).toBe(
      `[Engineering](urn:stream:${STREAM_UUID})`,
    );
    expect(formatWorkspaceComposerReference(topicReference)).toBe(
      `[#Engineering › Releases](urn:topic:${TOPIC_UUID})`,
    );
  });

  it("replaces the active hash query and leaves the cursor after a trailing space", () => {
    const result = insertWorkspaceComposerReference("Ship #rel today", 5, 9, {
      kind: "topic",
      topicUuid: TOPIC_UUID,
      streamUuid: STREAM_UUID,
      streamName: "Engineering",
      topicName: "Releases",
    });

    expect(result).toEqual({
      value: `Ship [#Engineering › Releases](urn:topic:${TOPIC_UUID})  today`,
      cursorPosition: `Ship [#Engineering › Releases](urn:topic:${TOPIC_UUID}) `.length,
    });
  });

  it("converts only known current Workspace routes and keeps other URLs unchanged", () => {
    const converted = replaceWorkspaceComposerLinks(
      "https://chat.example.com/org/acme/project/project-uuid/stream/11111111-1111-4111-8111-111111111111/topic/22222222-2222-4222-8222-222222222222 and https://example.com/docs",
      {
        streamsById: { [STREAM_UUID]: createStream() },
        topicsById: { [TOPIC_UUID]: createTopic() },
      },
      "https://chat.example.com",
    );

    expect(converted).toContain(`[#Engineering › Releases](urn:topic:${TOPIC_UUID})`);
    expect(converted).toContain("https://example.com/docs");
  });

  it("keeps an internal route when its stream or topic is not in the local store", () => {
    const url =
      "ew://open/org/acme/project/project-uuid/stream/11111111-1111-4111-8111-111111111111";

    expect(replaceWorkspaceComposerLinks(url, { streamsById: {}, topicsById: {} }, null)).toBe(url);
  });

  it("converts a known ew Workspace route", () => {
    const url = `ew://open/org/acme/project/project-uuid/stream/${STREAM_UUID}/topic/${TOPIC_UUID}`;

    expect(
      replaceWorkspaceComposerLinks(
        url,
        {
          streamsById: { [STREAM_UUID]: createStream() },
          topicsById: { [TOPIC_UUID]: createTopic() },
        },
        null,
      ),
    ).toBe(`[#Engineering › Releases](urn:topic:${TOPIC_UUID})`);
  });
});
