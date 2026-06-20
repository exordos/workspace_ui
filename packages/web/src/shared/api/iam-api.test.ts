/**
 * Tests for IAM API client.
 */
import "./messenger.test.setup";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildIamMePath,
  buildIamUserPath,
  fetchIamUserByUuid,
  fetchIamUsers,
  getIamCurrentUser,
  IAM_ME_CLIENT_ID,
  IAM_USERS_PATH,
} from "./iam-api";
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

const TEST_UUID = "00000000-0000-0000-0000-000000000001";

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
          uuid: TEST_UUID,
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
      user_id: TEST_UUID,
      full_name: "Admin Admin",
      email: "admin@genesis-core.tech",
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

describe("fetchIamUsers", () => {
  beforeEach(() => {
    mockGetCurrentInstance.mockReturnValue(IAM_INSTANCE);
  });

  it("calls IAM users list endpoint", async () => {
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          uuid: TEST_UUID,
          first_name: "Alice",
          email: "alice@example.com",
          status: "ACTIVE",
        },
      ],
      raw: { statusText: "OK" },
    });

    const result = await fetchIamUsers();

    expect(result).toEqual([
      {
        user_id: TEST_UUID,
        full_name: "Alice",
        email: "alice@example.com",
        is_active: true,
      },
    ]);
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "https://chat.example.com",
      IAM_USERS_PATH,
      undefined,
      undefined,
    );
  });
});

describe("fetchIamUserByUuid", () => {
  beforeEach(() => {
    mockGetCurrentInstance.mockReturnValue(IAM_INSTANCE);
  });

  it("loads IAM user detail by UUID", async () => {
    const bobUuid = "00000000-0000-0000-0000-000000000002";
    mockMessengerApi.getWithBase.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        uuid: bobUuid,
        username: "bob",
        email: "bob@example.com",
        status: "ACTIVE",
      },
      raw: { statusText: "OK" },
    });

    const result = await fetchIamUserByUuid(bobUuid);

    expect(result?.full_name).toBe("bob");
    expect(mockMessengerApi.getWithBase).toHaveBeenCalledWith(
      "https://chat.example.com",
      buildIamUserPath(bobUuid),
      undefined,
      undefined,
    );
  });
});
