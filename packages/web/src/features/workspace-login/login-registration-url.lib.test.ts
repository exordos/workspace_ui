import { describe, expect, it } from "vitest";
import { normalizeLoginRegistrationUrl } from "./login-registration-url.lib";

describe("normalizeLoginRegistrationUrl", () => {
  it("accepts an absolute HTTPS registration URL", () => {
    expect(normalizeLoginRegistrationUrl("https://iam.example.com/register")).toBe(
      "https://iam.example.com/register",
    );
  });

  it.each([undefined, "", "not-a-url", "http://iam.example.com/register"])(
    "rejects an unavailable or unsafe registration URL: %s",
    (value) => {
      expect(normalizeLoginRegistrationUrl(value)).toBeNull();
    },
  );
});
