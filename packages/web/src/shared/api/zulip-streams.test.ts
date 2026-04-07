/**
 * Tests for Zulip API (zulip-streams module).
 */
import "./zulip.test.setup";
import { describe, expect, it, vi } from "vitest";
import { getCurrentInstance } from "./client";
import { fetchUserTopics, registerQueue } from "./zulip-queue";
import {
  deleteStream,
  fetchStreamMembers,
  fetchStreams,
  fetchSubscriptions,
  fetchTopics,
  updateStream,
} from "./zulip-streams";
import { getMockZulipApi, getMockZulipClient, TEST_INSTANCE } from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();
const mockZulipClient = getMockZulipClient();

describe("fetchSubscriptions", () => {
  it("maps subscriptions and derives muted state", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        subscriptions: [
          { stream_id: 1, name: "general", is_muted: true },
          { stream_id: 2, name: "dev", in_home_view: false },
        ],
      },
      raw: { statusText: "OK" },
    });

    await expect(fetchSubscriptions()).resolves.toEqual([
      { stream_id: 1, name: "general", is_muted: true },
      { stream_id: 2, name: "dev", is_muted: true },
    ]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/users/me/subscriptions", undefined);
  });
});

describe("fetchUserTopics", () => {
  it("returns user topic visibility overrides cached from register", async () => {
    mockZulipApi.post.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        result: "success",
        queue_id: "q-with-topics",
        last_event_id: -1,
        user_topics: [{ stream_id: 10, topic_name: "bugs", visibility_policy: 1 }],
      },
      raw: { statusText: "OK" },
    });

    await registerQueue(["message", "user_topic"]);
    await expect(fetchUserTopics()).resolves.toEqual([
      { stream_id: 10, topic_name: "bugs", visibility_policy: 1 },
    ]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });

  it("returns empty array when register cache is not available", async () => {
    vi.mocked(getCurrentInstance).mockReturnValue({
      ...TEST_INSTANCE,
      email: "uncached@example.com",
    });

    await expect(fetchUserTopics()).resolves.toEqual([]);
    expect(mockZulipApi.get).not.toHaveBeenCalled();
  });
});

describe("fetchStreamMembers", () => {
  it("returns subscriber ids", async () => {
    mockZulipApi.get.mockResolvedValue({
      ok: true,
      status: 200,
      data: { subscribers: [1, 2, 3] },
      raw: { statusText: "OK" },
    });

    await expect(fetchStreamMembers(10)).resolves.toEqual([1, 2, 3]);
    expect(mockZulipApi.get).toHaveBeenCalledWith("/streams/10/members", undefined);
  });
});

describe("fetchTopics", () => {
  it("returns topic names for an existing stream", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });
    mockZulipClient.streams.topics.retrieve.mockResolvedValue({
      topics: [{ name: "planning" }, { name: "release" }],
    });

    await expect(fetchTopics("engineering")).resolves.toEqual(["planning", "release"]);
    expect(mockZulipClient.streams.topics.retrieve).toHaveBeenCalledWith({ stream_id: 10 });
  });

  it("returns empty array when stream is not found", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [{ stream_id: 10, name: "engineering" }],
    });

    await expect(fetchTopics("design")).resolves.toEqual([]);
    expect(mockZulipClient.streams.topics.retrieve).not.toHaveBeenCalled();
  });

  it("throws when stream name is blank", async () => {
    await expect(fetchTopics("   ")).rejects.toThrow(
      /fetchTopics\.stream must be a non-empty string/,
    );
    expect(mockZulipClient.streams.retrieve).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchStreams — uses zulip-js client
// ---------------------------------------------------------------------------

describe("fetchStreams", () => {
  it("returns mapped streams", async () => {
    mockZulipClient.streams.retrieve.mockResolvedValue({
      streams: [
        { stream_id: 1, name: "general", description: "Main" },
        { stream_id: 2, name: "dev" },
      ],
    });

    const result = await fetchStreams();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      stream_id: 1,
      name: "general",
      description: "Main",
      is_announcement_only: false,
    });
    expect(result[1]!.description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fetchMessages — uses zulip-js client
// ---------------------------------------------------------------------------
describe("updateStream", () => {
  it("patches stream name and description", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(
      updateStream(10, { name: "platform", description: "Platform discussions" }),
    ).resolves.toBe(true);
    expect(mockZulipApi.patch).toHaveBeenCalledWith("/streams/10", {
      new_name: "platform",
      description: "Platform discussions",
    });
  });

  it("returns false when stream update API is not ok", async () => {
    mockZulipApi.patch.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Forbidden" },
      raw: { statusText: "Forbidden" },
    });

    await expect(updateStream(10, { name: "platform" })).resolves.toBe(false);
  });
});

describe("deleteStream", () => {
  it("deletes stream by id", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      raw: { statusText: "OK" },
    });

    await expect(deleteStream(10)).resolves.toBe(true);
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/streams/10", undefined);
  });

  it("returns false on delete failure", async () => {
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Bad request" },
      raw: { statusText: "Bad Request" },
    });

    await expect(deleteStream(10)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addReaction — authenticated POST with guard
