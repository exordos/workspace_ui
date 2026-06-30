import { describe, expect, it } from "vitest";
import { parseWorkspaceMessengerAuthProfile } from "./workspace-messenger-profile.api";

describe("parseWorkspaceMessengerAuthProfile", () => {
  it("accepts partial user profile payloads for auth identity", () => {
    expect(
      parseWorkspaceMessengerAuthProfile({
        uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
        first_name: "Alice",
        last_name: "Workspace",
        email: "alice@example.com",
      }),
    ).toEqual({
      uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
      username: null,
      first_name: "Alice",
      last_name: "Workspace",
      email: "alice@example.com",
      status: null,
    });
  });

  it("unwraps common response envelopes", () => {
    expect(
      parseWorkspaceMessengerAuthProfile({
        data: {
          uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
          username: "alice",
          status: "active",
        },
      }),
    ).toMatchObject({
      uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
      username: "alice",
      status: "active",
    });
  });
});
