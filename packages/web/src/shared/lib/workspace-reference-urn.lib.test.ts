import { describe, expect, it } from "vitest";
import {
  buildWorkspaceMessageUrn,
  buildWorkspaceQuoteUrn,
  buildWorkspaceReferenceUrn,
  buildWorkspaceStreamUrn,
  buildWorkspaceTopicUrn,
  buildWorkspaceUserUrn,
  parseWorkspaceReferenceUrn,
} from "./workspace-reference-urn.lib";

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_UUID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_UUID = "44444444-4444-4444-8444-444444444444";

describe("Workspace reference URNs", () => {
  it("builds canonical URNs for supported Workspace entities", () => {
    expect(buildWorkspaceUserUrn(USER_UUID)).toBe(`urn:user:${USER_UUID}`);
    expect(buildWorkspaceMessageUrn(MESSAGE_UUID)).toBe(`urn:message:${MESSAGE_UUID}`);
    expect(buildWorkspaceStreamUrn(STREAM_UUID)).toBe(`urn:stream:${STREAM_UUID}`);
    expect(buildWorkspaceTopicUrn(TOPIC_UUID)).toBe(`urn:topic:${TOPIC_UUID}`);
    expect(buildWorkspaceQuoteUrn(MESSAGE_UUID)).toBe(`urn:quote:${MESSAGE_UUID}`);
  });

  it("builds the same contract from typed references", () => {
    expect(buildWorkspaceReferenceUrn({ kind: "stream", streamUuid: STREAM_UUID })).toBe(
      `urn:stream:${STREAM_UUID}`,
    );
    expect(
      buildWorkspaceReferenceUrn({
        kind: "topic",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
      }),
    ).toBe(`urn:topic:${TOPIC_UUID}`);
    expect(buildWorkspaceReferenceUrn({ kind: "topic", topicUuid: TOPIC_UUID })).toBe(
      `urn:topic:${TOPIC_UUID}`,
    );
    expect(
      buildWorkspaceReferenceUrn({
        kind: "quote",
        messageUuid: MESSAGE_UUID,
        text: "Selected text",
      }),
    ).toBe(`urn:quote:${MESSAGE_UUID}?text=Selected%20text`);
  });

  it("parses existing user/message URNs and both topic URN formats", () => {
    expect(parseWorkspaceReferenceUrn(`urn:user:${USER_UUID}`)).toEqual({
      kind: "user",
      userUuid: USER_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`urn:message:${MESSAGE_UUID}`)).toEqual({
      kind: "message",
      messageUuid: MESSAGE_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`urn:stream:${STREAM_UUID}`)).toEqual({
      kind: "stream",
      streamUuid: STREAM_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`urn:topic:${STREAM_UUID}:${TOPIC_UUID}`)).toEqual({
      kind: "topic",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`urn:topic:${TOPIC_UUID}`)).toEqual({
      kind: "topic",
      topicUuid: TOPIC_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`urn:quote:${MESSAGE_UUID}`)).toEqual({
      kind: "quote",
      messageUuid: MESSAGE_UUID,
    });
  });

  it("round-trips quote text without changing its meaning", () => {
    const text = "Юникод\nline two & # ? % )";
    const urn = buildWorkspaceQuoteUrn(MESSAGE_UUID, text);

    expect(urn).toBe(
      `urn:quote:${MESSAGE_UUID}?text=%D0%AE%D0%BD%D0%B8%D0%BA%D0%BE%D0%B4%0Aline%20two%20%26%20%23%20%3F%20%25%20%29`,
    );
    expect(parseWorkspaceReferenceUrn(urn)).toEqual({
      kind: "quote",
      messageUuid: MESSAGE_UUID,
      text,
    });
  });

  it("treats empty quote text as absent", () => {
    expect(buildWorkspaceQuoteUrn(MESSAGE_UUID, "")).toBe(`urn:quote:${MESSAGE_UUID}`);
    expect(parseWorkspaceReferenceUrn(`urn:quote:${MESSAGE_UUID}?text=`)).toEqual({
      kind: "quote",
      messageUuid: MESSAGE_UUID,
    });
  });

  it("rejects invalid UUIDs, metadata, extra segments, and legacy links", () => {
    expect(buildWorkspaceUserUrn("user-uuid")).toBeNull();
    expect(buildWorkspaceTopicUrn("topic-uuid")).toBeNull();
    expect(buildWorkspaceQuoteUrn("message-uuid", "text")).toBeNull();
    expect(buildWorkspaceReferenceUrn({ kind: "stream", streamUuid: "stream-uuid" })).toBeNull();

    const invalidValues = [
      "urn:stream:not-a-uuid",
      `urn:stream:${STREAM_UUID}?project=project-uuid`,
      `urn:topic:${STREAM_UUID}:${TOPIC_UUID}:extra`,
      "urn:quote:not-a-uuid",
      `urn:quote:${MESSAGE_UUID}?unknown=value`,
      `urn:quote:${MESSAGE_UUID}?text=first&text=second`,
      `urn:quote:${MESSAGE_UUID}?text=value&unknown=value`,
      `urn:quote:${MESSAGE_UUID}?text=%E0%A4%A`,
      "/stream/10-general/topic/Bugs",
      "https://zulip.example/#narrow/channel/10-general/topic/Bugs",
    ];
    for (const value of invalidValues) {
      expect(parseWorkspaceReferenceUrn(value)).toBeNull();
    }
  });

  it("accepts surrounding whitespace but does not change the parsed UUIDs", () => {
    expect(parseWorkspaceReferenceUrn(`  urn:topic:${STREAM_UUID}:${TOPIC_UUID}  `)).toEqual({
      kind: "topic",
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
    expect(parseWorkspaceReferenceUrn(`  urn:topic:${TOPIC_UUID}  `)).toEqual({
      kind: "topic",
      topicUuid: TOPIC_UUID,
    });
  });
});
