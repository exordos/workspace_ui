import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/shared/api/client", () => ({
  messengerApi: {
    post: vi.fn(),
  },
}));

import { messengerApi } from "~/shared/api/client";
import { subscribeCurrentUserToStream } from "./create-chat.api";

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
