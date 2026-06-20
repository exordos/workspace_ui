import { describe, expect, it } from "vitest";
import { parseIamCurrentUserFromApiData } from "./iam-current-user.lib";

const TEST_UUID = "00000000-0000-0000-0000-000000000001";

describe("parseIamCurrentUserFromApiData", () => {
  it("maps IAM user fields to workspace current user with UUID user_id", () => {
    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: TEST_UUID,
          first_name: "Admin",
          last_name: "Admin",
          surname: "",
          email: "admin@genesis-core.tech",
          username: "admin",
        },
        organization: [],
        project_id: null,
      }),
    ).toEqual({
      user_id: TEST_UUID,
      full_name: "Admin Admin",
      email: "admin@genesis-core.tech",
    });
  });

  it("falls back to name then username for full_name", () => {
    const displayUuid = "00000000-0000-0000-0000-000000000002";
    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: displayUuid,
          name: "Display Name",
          username: "login",
        },
        organization: [],
        project_id: null,
      }),
    ).toEqual({
      user_id: displayUuid,
      full_name: "Display Name",
      email: "",
    });

    const loginUuid = "00000000-0000-0000-0000-000000000003";
    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: loginUuid,
          username: "login-only",
        },
        organization: [],
        project_id: null,
      }),
    ).toEqual({
      user_id: loginUuid,
      full_name: "login-only",
      email: "",
    });
  });

  it("returns null when user uuid is missing", () => {
    expect(parseIamCurrentUserFromApiData({ user: { email: "a@b.com" } })).toBeNull();
    expect(parseIamCurrentUserFromApiData(null)).toBeNull();
  });
});
