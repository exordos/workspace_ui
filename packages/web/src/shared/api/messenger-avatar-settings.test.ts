import { describe, expect, it, vi } from "vitest";
import { getMockMessengerApi } from "./messenger.test.setup";
// The shared client mock must load before the module under test.
// eslint-disable-next-line import-x/order
import {
  getOwnAvatarCapabilities,
  removeOwnAvatar,
  uploadOwnAvatar,
} from "./messenger-avatar-settings";

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const AVATAR_UUID = "22222222-2222-4222-8222-222222222222";
const mockMessengerApi = getMockMessengerApi();

vi.mock("~/shared/lib/access-token-claims.lib", () => ({
  resolveUserUuidFromAccessToken: () => USER_UUID,
}));

vi.mock("~/shared/lib/iam-instance.lib", () => ({
  resolveIamAccessToken: () => "access-token",
}));

describe("Workspace own avatar API", () => {
  it("enables avatar changes with the backend size limit", () => {
    expect(getOwnAvatarCapabilities()).toEqual({
      maxAvatarFileSizeMib: 25,
      avatarChangesDisabled: false,
    });
  });

  it("uploads the avatar through the own-user multipart action", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { avatar: `urn:image:${AVATAR_UUID}` },
    });
    const file = new File(["image"], "avatar.png", { type: "image/png" });

    await expect(uploadOwnAvatar(file)).resolves.toEqual({
      ok: true,
      avatarUrl: `urn:image:${AVATAR_UUID}`,
    });
    expect(mockMessengerApi.postFormDataWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/avatar_upload/invoke`,
      expect.any(FormData),
    );
    const form = mockMessengerApi.postFormDataWithBase.mock.calls[0]?.[2] as FormData;
    expect(form.get("file")).toBe(file);
  });

  it("resets the avatar through the own-user reset action", async () => {
    const defaultAvatar = "urn:gravatar:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    mockMessengerApi.postJsonWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: { avatar: defaultAvatar },
    });

    await expect(removeOwnAvatar()).resolves.toEqual({
      ok: true,
      avatarUrl: defaultAvatar,
    });
    expect(mockMessengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1",
      `/users/${USER_UUID}/actions/avatar_reset/invoke`,
      {},
    );
  });

  it("maps invalid avatar data to the profile invalid state", async () => {
    mockMessengerApi.postFormDataWithBase.mockResolvedValue({
      ok: false,
      status: 415,
      data: { message: "Invalid avatar image" },
    });

    await expect(
      uploadOwnAvatar(new File(["text"], "avatar.txt", { type: "text/plain" })),
    ).resolves.toEqual({
      ok: false,
      kind: "invalid",
      message: "Invalid avatar image",
    });
  });
});
