import { describe, expect, it } from "vitest";
import { resolveIamAccessToken, resolveIamApiOrigin } from "./iam-instance.lib";

describe("resolveIamApiOrigin", () => {
  it("prefers stored workspaceOrgOrigin", () => {
    expect(
      resolveIamApiOrigin({
        realm: "https://other.example.com",
        workspaceOrgOrigin: "https://stored.example.com",
      }),
    ).toBe("https://stored.example.com");
  });

  it("derives origin from login realm URL", () => {
    expect(resolveIamApiOrigin({ realm: "https://chat.example.com/api/messenger/v1" })).toBe(
      "https://chat.example.com",
    );
  });
});

describe("resolveIamAccessToken", () => {
  it("returns iamAccessToken for IAM instances", () => {
    expect(
      resolveIamAccessToken({
        authType: "iam",
        iamAccessToken: "fixture-iam-value-a",
      }),
    ).toBe("fixture-iam-value-a");
  });

  it("returns empty string when IAM token is missing", () => {
    expect(
      resolveIamAccessToken({
        authType: "iam",
        iamAccessToken: "",
      }),
    ).toBe("");
  });
});
