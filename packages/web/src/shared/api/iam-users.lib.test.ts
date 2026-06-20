import { describe, expect, it } from "vitest";
import {
  buildFullNameFromIamUser,
  parseIamUserFromApiData,
  parseIamUserListFromApiData,
} from "./iam-users.lib";

const TEST_UUID = "00000000-0000-0000-0000-000000000001";

describe("parseIamUserListFromApiData", () => {
  it("maps IAM directory rows to messenger members with UUID user_id", () => {
    const members = parseIamUserListFromApiData([
      {
        uuid: TEST_UUID,
        first_name: "Alice",
        last_name: "Admin",
        email: "alice@example.com",
        status: "ACTIVE",
      },
    ]);

    expect(members).toEqual([
      {
        user_id: TEST_UUID,
        full_name: "Alice Admin",
        email: "alice@example.com",
        is_active: true,
      },
    ]);
  });

  it("returns empty array for non-array payloads", () => {
    expect(parseIamUserListFromApiData(null)).toEqual([]);
  });

  it("supports paginated IAM list payloads", () => {
    const members = parseIamUserListFromApiData({
      count: 1,
      results: [
        {
          uuid: TEST_UUID,
          first_name: "Alice",
          email: "alice@example.com",
          status: "ACTIVE",
        },
      ],
    });

    expect(members).toEqual([
      {
        user_id: TEST_UUID,
        full_name: "Alice",
        email: "alice@example.com",
        is_active: true,
      },
    ]);
  });
});

describe("parseIamUserFromApiData", () => {
  it("maps IAM user detail payload", () => {
    expect(
      parseIamUserFromApiData({
        uuid: "00000000-0000-0000-0000-000000000003",
        username: "bob",
        email: "bob@example.com",
        status: "ACTIVE",
      }),
    ).toEqual({
      user_id: "00000000-0000-0000-0000-000000000003",
      full_name: "bob",
      email: "bob@example.com",
      is_active: true,
    });
  });
});

describe("buildFullNameFromIamUser", () => {
  it("prefers first, last, and surname", () => {
    expect(
      buildFullNameFromIamUser({
        uuid: "00000000-0000-0000-0000-000000000004",
        first_name: "A",
        last_name: "B",
        surname: "C",
      }),
    ).toBe("A B C");
  });
});
