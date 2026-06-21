import { beforeEach, describe, expect, it, vi } from "vitest";
import { messengerApi } from "~/shared/api/client";
import { resolveOrCreateDirectMessageStream } from "~/shared/api/messenger-streams";
import { startDirectMessage, subscribeCurrentUserToStream } from "./create-chat.api";

vi.mock("~/shared/api/client", () => ({
  messengerApi: {
    post: vi.fn(),
  },
}));

vi.mock("~/shared/api/messenger-streams", () => ({
  resolveOrCreateDirectMessageStream: vi.fn(),
}));

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
const STREAM_UUID = "b4460c02-d693-4564-8804-98059613b86e";
describe("startDirectMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates gateway private stream for IAM peer and returns streamUuid route", async () => {
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

  it("returns legacy slug for numeric messenger ids", async () => {
    await expect(startDirectMessage(42, "Alice")).resolves.toEqual({
      kind: "legacy",
      slug: "42-alice",
    });
    expect(resolveOrCreateDirectMessageStream).not.toHaveBeenCalled();
  });
});

describe("subscribeCurrentUserToStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts subscriptions without principals for the current user", async () => {
    vi.mocked(messengerApi.post).mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "success" },
      headers: new Headers(),
      raw: new Response(),
      durationMs: 0,
    });

    await expect(subscribeCurrentUserToStream("engineering", 10)).resolves.toEqual({ ok: true });

    expect(messengerApi.post).toHaveBeenCalledWith("/users/me/subscriptions", {
      subscriptions: JSON.stringify([{ name: "engineering" }]),
    });
  });

  it("returns error code for non-ok http response", async () => {
    vi.mocked(messengerApi.post).mockResolvedValue({
      ok: false,
      status: 403,
      data: { result: "error" },
      headers: new Headers(),
      raw: new Response(),
      durationMs: 0,
    });

    await expect(subscribeCurrentUserToStream("engineering", 10)).resolves.toEqual({
      ok: false,
      errorCode: "http_403",
    });
  });

  it("returns error code when api responds with result=error", async () => {
    vi.mocked(messengerApi.post).mockResolvedValue({
      ok: true,
      status: 200,
      data: { result: "error", code: "BAD_REQUEST" },
      headers: new Headers(),
      raw: new Response(),
      durationMs: 0,
    });

    await expect(subscribeCurrentUserToStream("engineering", 10)).resolves.toEqual({
      ok: false,
      errorCode: "BAD_REQUEST",
    });
  });
});
