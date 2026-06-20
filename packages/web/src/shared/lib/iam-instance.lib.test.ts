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
    expect(resolveIamApiOrigin({ realm: "https://chat.example.com/api/v1" })).toBe(
      "https://chat.example.com",
    );
  });
});

describe("resolveIamAccessToken", () => {
  it("returns iamAccessToken for IAM instances", () => {
    expect(
      resolveIamAccessToken({
        authType: "iam",
        apiKey: "",
        iamAccessToken: "fixture-iam-value-a",
      }),
    ).toBe("fixture-iam-value-a");
  });

  it("falls back to apiKey for legacy IAM instances", () => {
    expect(
      resolveIamAccessToken({
        authType: "iam",
        apiKey: "fixture-iam-value-b",
      }),
    ).toBe("fixture-iam-value-b");
  });

  it("returns empty string for non-IAM instances", () => {
    expect(
      resolveIamAccessToken({
        authType: "api_key",
        apiKey: "fixture-basic-key",
        iamAccessToken: "unused-value",
      }),
    ).toBe("");
  });
});
