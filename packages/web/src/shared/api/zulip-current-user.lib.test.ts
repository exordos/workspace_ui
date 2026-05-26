import { describe, expect, it } from "vitest";
import { parseCurrentUserFromApiData } from "./zulip-current-user.lib";

describe("parseCurrentUserFromApiData", () => {
  it("parses flat user_id payload", () => {
    expect(
      parseCurrentUserFromApiData({
        user_id: 42,
        full_name: "Alice",
        email: "alice@test.com",
      }),
    ).toEqual({ user_id: 42, full_name: "Alice", email: "alice@test.com" });
  });

  it("parses nested user object", () => {
    expect(
      parseCurrentUserFromApiData({
        result: "success",
        user: {
          user_id: 99,
          full_name: "Bob",
          email: "bob@test.com",
        },
      }),
    ).toEqual({ user_id: 99, full_name: "Bob", email: "bob@test.com" });
  });

  it("parses string user_id", () => {
    expect(parseCurrentUserFromApiData({ user_id: "7" })).toEqual({
      user_id: 7,
      full_name: "",
      email: "",
    });
  });

  it("returns null on error result", () => {
    expect(parseCurrentUserFromApiData({ result: "error" })).toBeNull();
  });
});
