import { describe, expect, it } from "vitest";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import {
  resolveMarkTopicResolvedVisibility,
  resolveMarkTopicResolvedVisibilityForTopic,
  resolveTopicResolveTargetFromContext,
} from "./mark-topic-resolved.lib";

const STREAM_UUID_10 = "00000000-0000-4000-8000-000000000010";
const TOPIC_UUID_10 = "00000000-0000-4000-8000-000000000110";

describe("mark-topic-resolved.lib", () => {
  it("returns topic target for stream topic narrow", () => {
    expect(
      resolveTopicResolveTargetFromContext({
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: "incident",
        topicUuid: TOPIC_UUID_10,
      }),
    ).toEqual({ streamId: STREAM_UUID_10, topic: "incident", topicUuid: TOPIC_UUID_10 });
  });

  it("returns null for stream-wide view", () => {
    expect(
      resolveTopicResolveTargetFromContext({
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: "general",
        streamWideView: true,
      }),
    ).toBeNull();
  });

  it("returns null for dm context", () => {
    expect(
      resolveTopicResolveTargetFromContext({
        type: "dm",
        dmKey: "1,2",
      }),
    ).toBeNull();
  });

  it("allows toggle in stream topic narrow with stream slug", () => {
    const visibility = resolveMarkTopicResolvedVisibility({
      context: {
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: "incident",
        topicUuid: TOPIC_UUID_10,
      },
      currentUserId: 42,
      streamNameFromMap: "",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(true);
    expect(visibility.blockers).toEqual([]);
    expect(visibility.streamSlug).toBe(STREAM_UUID_10);
  });

  it("allows toggle for member without client-side permission metadata", () => {
    const visibility = resolveMarkTopicResolvedVisibility({
      context: {
        type: "stream",
        streamId: "00000000-0000-4000-8000-000000000560",
        streamName: "InternalServicesDev",
        topic: "test",
        topicUuid: "00000000-0000-4000-8000-000000000561",
      },
      currentUserId: 507,
      streamNameFromMap: "InternalServicesDev",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(true);
    expect(visibility.blockers).toEqual([]);
  });

  it("allows toggle for explicit sidebar topic target", () => {
    const visibility = resolveMarkTopicResolvedVisibilityForTopic({
      streamId: STREAM_UUID_10,
      topic: "incident",
      topicUuid: TOPIC_UUID_10,
      streamName: "engineering",
      currentUserId: 42,
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(true);
    expect(visibility.streamSlug).toBe(STREAM_UUID_10);
  });

  it("blocks toggle when current user is missing", () => {
    const visibility = resolveMarkTopicResolvedVisibility({
      context: {
        type: "stream",
        streamId: STREAM_UUID_10,
        streamName: "engineering",
        topic: "incident",
        topicUuid: TOPIC_UUID_10,
      },
      currentUserId: null,
      streamNameFromMap: "engineering",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(false);
    expect(visibility.blockers).toContain("no_current_user");
  });

  it("blocks toggle when topic UUID is missing", () => {
    const visibility = resolveMarkTopicResolvedVisibilityForTopic({
      streamId: STREAM_UUID_10,
      topic: "incident",
      streamName: "engineering",
      currentUserId: 42,
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(false);
    expect(visibility.blockers).toContain("no_topic_uuid");
  });
});
