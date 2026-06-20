import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockGetCurrentInstance, getMockZulipApi } from "./zulip.test.setup";

const mockZulipApi = getMockZulipApi();

const getCachedOwnAvatarCapabilitiesMock = vi.hoisted(() => vi.fn());

vi.mock("./zulip-queue", () => ({
  getCachedOwnAvatarCapabilities: getCachedOwnAvatarCapabilitiesMock,
}));

beforeEach(() => {
  getCachedOwnAvatarCapabilitiesMock.mockReset();
  getCachedOwnAvatarCapabilitiesMock.mockReturnValue({});
});

describe("getOwnAvatarCapabilities", () => {
  it("returns register-derived capabilities", async () => {
    const { getOwnAvatarCapabilities } = await import("./zulip-avatar-settings");
    getCachedOwnAvatarCapabilitiesMock.mockReturnValue({
      max_avatar_file_size_mib: 12,
      realm_avatar_changes_disabled: true,
      server_avatar_changes_disabled: false,
    });

    expect(getOwnAvatarCapabilities()).toEqual({
      maxAvatarFileSizeMib: 12,
      realmAvatarChangesDisabled: true,
      serverAvatarChangesDisabled: false,
      avatarChangesDisabled: true,
    });
  });

  it("uses defaults when register metadata is absent", async () => {
    const { getOwnAvatarCapabilities } = await import("./zulip-avatar-settings");
    getCachedOwnAvatarCapabilitiesMock.mockReturnValue({});

    expect(getOwnAvatarCapabilities()).toEqual({
      maxAvatarFileSizeMib: 25,
      realmAvatarChangesDisabled: false,
      serverAvatarChangesDisabled: false,
      avatarChangesDisabled: false,
    });
  });
});

describe("uploadOwnAvatar", () => {
  it("uploads one file via multipart and returns avatar URL", async () => {
    const { uploadOwnAvatar } = await import("./zulip-avatar-settings");
    getCachedOwnAvatarCapabilitiesMock.mockReturnValue({});
    mockZulipApi.postFormData.mockResolvedValue({
      ok: true,
      status: 200,
      data: { avatar_url: "/avatar/new.png" },
      raw: { statusText: "OK" },
    });

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const result = await uploadOwnAvatar(file);

    expect(result).toEqual({ ok: true, avatarUrl: "/avatar/new.png" });
    expect(mockZulipApi.postFormData).toHaveBeenCalledWith(
      "/users/me/avatar",
      expect.any(FormData),
      undefined,
    );
  });

  it("maps 403 into forbidden error", async () => {
    const { uploadOwnAvatar } = await import("./zulip-avatar-settings");
    mockZulipApi.postFormData.mockResolvedValue({
      ok: false,
      status: 403,
      data: { msg: "Avatar changes are disabled" },
      raw: { statusText: "Forbidden" },
    });

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const result = await uploadOwnAvatar(file);
    expect(result).toEqual({
      ok: false,
      status: 403,
      kind: "forbidden",
      message: "Avatar changes are disabled",
    });
  });

  it("maps 400 into invalid error", async () => {
    const { uploadOwnAvatar } = await import("./zulip-avatar-settings");
    mockZulipApi.postFormData.mockResolvedValue({
      ok: false,
      status: 400,
      data: { msg: "Uploaded file is larger than the allowed limit of 10 MiB" },
      raw: { statusText: "Bad Request" },
    });

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const result = await uploadOwnAvatar(file);
    expect(result).toEqual({
      ok: false,
      status: 400,
      kind: "invalid",
      message: "Uploaded file is larger than the allowed limit of 10 MiB",
    });
  });

  it("maps 404/405 into unsupported error", async () => {
    const { uploadOwnAvatar } = await import("./zulip-avatar-settings");
    mockZulipApi.postFormData.mockResolvedValue({
      ok: false,
      status: 404,
      data: { msg: "Not found" },
      raw: { statusText: "Not Found" },
    });

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const result = await uploadOwnAvatar(file);
    expect(result).toEqual({
      ok: false,
      status: 404,
      kind: "unsupported",
      message: "Not found",
    });
  });

  it("returns transient error when there is no active instance", async () => {
    const { uploadOwnAvatar } = await import("./zulip-avatar-settings");
    getMockGetCurrentInstance().mockReturnValue(null);

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const result = await uploadOwnAvatar(file);
    expect(result).toEqual({
      ok: false,
      status: 0,
      kind: "transient",
      message: "No active instance",
    });
  });
});

describe("removeOwnAvatar", () => {
  it("removes avatar and returns fallback avatar URL", async () => {
    const { removeOwnAvatar } = await import("./zulip-avatar-settings");
    mockZulipApi.delete.mockResolvedValue({
      ok: true,
      status: 200,
      data: { avatar_url: "/avatar/default.png" },
      raw: { statusText: "OK" },
    });

    const result = await removeOwnAvatar();
    expect(result).toEqual({
      ok: true,
      avatarUrl: "/avatar/default.png",
    });
    expect(mockZulipApi.delete).toHaveBeenCalledWith("/users/me/avatar");
  });

  it("maps delete 405 into unsupported error", async () => {
    const { removeOwnAvatar } = await import("./zulip-avatar-settings");
    mockZulipApi.delete.mockResolvedValue({
      ok: false,
      status: 405,
      data: { msg: "Method not allowed" },
      raw: { statusText: "Method Not Allowed" },
    });

    const result = await removeOwnAvatar();
    expect(result).toEqual({
      ok: false,
      status: 405,
      kind: "unsupported",
      message: "Method not allowed",
    });
  });
});
