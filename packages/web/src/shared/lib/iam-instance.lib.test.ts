import { describe, expect, it } from "vitest";
import { resolveIamAccessToken } from "./iam-instance.lib";

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
