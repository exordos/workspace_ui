/**
 * Tests for IAM API client.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildIamMePath, getIamCurrentUser, IAM_ME_CLIENT_ID } from "./iam-api";
import { getMockGetCurrentInstance, getMockMessengerApi } from "./messenger.test.setup";

const mockGetCurrentInstance = getMockGetCurrentInstance();
const mockMessengerApi = getMockMessengerApi();

const IAM_INSTANCE = {
  id: "iam-inst",
  realm: "https://chat.example.com",
  login: "admin@genesis-core.tech",
  apiKey: "",
  authType: "iam" as const,
  iamAccessToken: "iam-token",
  workspaceOrgOrigin: "https://chat.example.com",
};

describe("getIamCurrentUser", () => {
  beforeEach(() => {
    mockGetCurrentInstance.mockReturnValue(IAM_INSTANCE);
  });

  it("calls IAM /actions/me on the org origin via getWithBase", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: {
          uuid: "00000000-0000-0000-0000-000000000001",
          first_name: "Admin",
          last_name: "Admin",
          email: "admin@genesis-core.tech",
        },
        organization: [],
        project_id: null,
      },
      raw: { statusText: "OK" },
    });

    const result = await getIamCurrentUser();

    expect(result).toEqual({
      user_id: 9,
      full_name: "Admin Admin",
      email: "admin@genesis-core.tech",
      iam_user_uuid: "00000000-0000-0000-0000-000000000001",
    });
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "https://chat.example.com",
      buildIamMePath(IAM_ME_CLIENT_ID),
      undefined,
      undefined,
    );
  });

  it("returns null on non-ok response", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: false,
      status: 401,
      data: {},
      raw: { statusText: "Unauthorized" },
    });
    expect(await getIamCurrentUser()).toBeNull();
  });

  it("returns null when instance is not IAM", async () => {
    mockGetCurrentInstance.mockReturnValue({
      ...IAM_INSTANCE,
      authType: "api_key",
      apiKey: "key",
    });
    expect(await getIamCurrentUser()).toBeNull();
    expect(mockMessengerApi.getWithBase).not.toHaveBeenCalled();
  });
});
