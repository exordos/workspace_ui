import { beforeEach, describe, expect, it, vi } from "vitest";
import { messengerApi } from "~/shared/api/client";
import {
  createWorkspaceStream,
  resolveOrCreateDirectMessageStream,
} from "~/shared/api/messenger-streams";
import { createChannel, startDirectMessage, subscribeCurrentUserToStream } from "./create-chat.api";

vi.mock("~/shared/api/client", () => ({
  messengerApi: {
    post: vi.fn(),
  },
}));

vi.mock("~/shared/api/messenger-streams", () => ({
  createWorkspaceStream: vi.fn(),
  fetchSubscriptions: vi.fn(() => Promise.resolve([])),
  resolveOrCreateDirectMessageStream: vi.fn(),
  unarchiveStream: vi.fn(),
}));

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
const STREAM_UUID = "b4460c02-d693-4564-8804-98059613b86e";
describe("startDirectMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates gateway private stream for IAM peer and returns stream route metadata", async () => {
    vi.mocked(resolveOrCreateDirectMessageStream).mockResolvedValue({
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });

    await expect(startDirectMessage(PEER_UUID, "Alice Smith")).resolves.toEqual({
      kind: "gateway",
      streamUuid: STREAM_UUID,
      userUuid: PEER_UUID,
      name: "Alice Smith",
    });
    expect(resolveOrCreateDirectMessageStream).toHaveBeenCalledWith(PEER_UUID, "Alice Smith");
  });

  it("does not fall back to legacy numeric messenger ids", async () => {
    await expect(startDirectMessage(42, "Alice")).resolves.toBeNull();
    expect(resolveOrCreateDirectMessageStream).not.toHaveBeenCalled();
  });
});

describe("subscribeCurrentUserToStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unsupported without calling removed current-user subscriptions endpoint", async () => {
    await expect(subscribeCurrentUserToStream("engineering", PEER_UUID)).resolves.toEqual({
      ok: false,
      errorCode: "unsupported",
    });

    expect(messengerApi.post).not.toHaveBeenCalled();
  });

  it("returns invalid_user for an empty user id", async () => {
    await expect(subscribeCurrentUserToStream("engineering", "")).resolves.toEqual({
      ok: false,
      errorCode: "invalid_user",
    });

    expect(messengerApi.post).not.toHaveBeenCalled();
  });
});

describe("createChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a native stream and member bindings through the new stream API", async () => {
    vi.mocked(createWorkspaceStream).mockResolvedValue({
      streamUuid: STREAM_UUID,
      name: "engineering",
      boundUserIds: [PEER_UUID],
    });

    await expect(
      createChannel({
        name: "engineering",
        description: "Engineering",
        subscribers: [PEER_UUID],
        inviteOnly: true,
        announce: true,
      }),
    ).resolves.toEqual({ streamUuid: STREAM_UUID });

    expect(createWorkspaceStream).toHaveBeenCalledWith({
      name: "engineering",
      description: "Engineering",
      inviteOnly: true,
      announce: true,
      private: false,
      memberUserIds: [PEER_UUID],
    });
    expect(messengerApi.post).not.toHaveBeenCalled();
  });

  it("validates channel name before creating a stream", async () => {
    await expect(createChannel({ name: "   ", subscribers: [] })).rejects.toThrow(/channel name/);
    expect(createWorkspaceStream).not.toHaveBeenCalled();
    expect(messengerApi.post).not.toHaveBeenCalled();
  });
});
