import { describe, expect, it } from "vitest";
import {
  parseIamCurrentUserFromApiData,
  TEMPORARY_MESSENGER_USER_ID,
} from "./iam-current-user.lib";

describe("parseIamCurrentUserFromApiData", () => {
  it("maps IAM user fields to workspace current user with temporary messenger id", () => {
    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: "00000000-0000-0000-0000-000000000001",
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
      user_id: TEMPORARY_MESSENGER_USER_ID,
      full_name: "Admin Admin",
      email: "admin@genesis-core.tech",
      iam_user_uuid: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("falls back to name then username for full_name", () => {
    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: "00000000-0000-0000-0000-000000000002",
          name: "Display Name",
          username: "login",
        },
        organization: [],
        project_id: null,
      }),
    ).toEqual({
      user_id: TEMPORARY_MESSENGER_USER_ID,
      full_name: "Display Name",
      email: "",
      iam_user_uuid: "00000000-0000-0000-0000-000000000002",
    });

    expect(
      parseIamCurrentUserFromApiData({
        user: {
          uuid: "00000000-0000-0000-0000-000000000003",
          username: "login-only",
        },
        organization: [],
        project_id: null,
      }),
    ).toEqual({
      user_id: TEMPORARY_MESSENGER_USER_ID,
      full_name: "login-only",
      email: "",
      iam_user_uuid: "00000000-0000-0000-0000-000000000003",
    });
  });

  it("returns null when user uuid is missing", () => {
    expect(parseIamCurrentUserFromApiData({ user: { email: "a@b.com" } })).toBeNull();
    expect(parseIamCurrentUserFromApiData(null)).toBeNull();
  });
});
