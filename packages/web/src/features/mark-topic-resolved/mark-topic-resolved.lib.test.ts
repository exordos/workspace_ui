import { describe, expect, it } from "vitest";
import { buildStreamSlug } from "~/shared/lib/stream-slug.lib";
import {
  resolveMarkTopicResolvedVisibility,
  resolveTopicResolveTargetFromContext,
} from "./mark-topic-resolved.lib";

describe("mark-topic-resolved.lib", () => {
  it("returns topic target for stream topic narrow", () => {
    expect(
      resolveTopicResolveTargetFromContext({
        type: "stream",
        streamId: 10,
        streamName: "engineering",
        topic: "incident",
      }),
    ).toEqual({ streamId: 10, topic: "incident" });
  });

  it("returns null for stream-wide view", () => {
    expect(
      resolveTopicResolveTargetFromContext({
        type: "stream",
        streamId: 10,
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
        streamId: 10,
        streamName: "engineering",
        topic: "incident",
      },
      currentUserId: 42,
      streamNameFromMap: "",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(true);
    expect(visibility.blockers).toEqual([]);
    expect(visibility.streamSlug).toBe("10-engineering");
  });

  it("allows toggle for member without client-side permission metadata", () => {
    const visibility = resolveMarkTopicResolvedVisibility({
      context: {
        type: "stream",
        streamId: 560,
        streamName: "InternalServicesDev",
        topic: "test",
      },
      currentUserId: 507,
      streamNameFromMap: "InternalServicesDev",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(true);
    expect(visibility.blockers).toEqual([]);
  });

  it("blocks toggle when current user is missing", () => {
    const visibility = resolveMarkTopicResolvedVisibility({
      context: {
        type: "stream",
        streamId: 10,
        streamName: "engineering",
        topic: "incident",
      },
      currentUserId: null,
      streamNameFromMap: "engineering",
      buildStreamSlug,
    });

    expect(visibility.canToggle).toBe(false);
    expect(visibility.blockers).toContain("no_current_user");
  });
});
