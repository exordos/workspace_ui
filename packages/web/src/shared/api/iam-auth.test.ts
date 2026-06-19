/**
 * Tests for IAM-backed login (password grant only).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { IamOtpRequiredError, loginWithIamCredentials } from "./iam-auth";
import { jsonResponse, mockFetch } from "./messenger.test.setup";
import { MessengerAuthError } from "./messenger.types";

const IAM_ORIGIN = "https://chat.example.com";
const REALM = "https://chat.example.com";

function jwtWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("loginWithIamCredentials", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns IAM access token and email from JWT claims", async () => {
    const accessToken = jwtWithClaims({ email: "user@example.com", sub: "42" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: accessToken,
        refresh_token: "refresh-token",
        token_type: "Bearer",
      }),
    );

    const result = await loginWithIamCredentials(REALM, "user@example.com", "secret");

    expect(result).toEqual({
      access_token: accessToken,
      email: "user@example.com",
      user_id: 42,
      refresh_token: "refresh-token",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${IAM_ORIGIN}/api/core/v1/iam/clients/default/actions/get_token/invoke`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("falls back to login when JWT has no email claim", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: jwtWithClaims({ sub: "7" }) }));

    const result = await loginWithIamCredentials(REALM, "alice", "pw");

    expect(result.email).toBe("alice");
    expect(result.user_id).toBe(7);
  });

  it("sends login+password grant payload to IAM", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ email: "u@t.com" }) }),
    );

    await loginWithIamCredentials(REALM, "alice", "pw");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = init?.body;
    expect(typeof body).toBe("string");
    const params = new URLSearchParams(body as string);
    expect(params.get("grant_type")).toBe("login+password");
    expect(params.get("login")).toBe("alice");
    expect(params.get("password")).toBe("pw");
    expect(params.get("scope")).toContain("openid");
    expect(params.get("scope")).toContain("email");
  });

  it("forwards OTP code via X-OTP header", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ email: "u@t.com" }) }),
    );

    await loginWithIamCredentials(REALM, "alice", "pw", { otpCode: "123456" });

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ "X-OTP": "123456" });
  });

  it("throws IamOtpRequiredError when IAM requests OTP", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "OTP code is required for this account" }, 401),
    );

    await expect(loginWithIamCredentials(REALM, "alice", "pw")).rejects.toBeInstanceOf(
      IamOtpRequiredError,
    );
  });

  it("throws MessengerAuthError when IAM login fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Invalid credentials" }, 401));

    await expect(loginWithIamCredentials(REALM, "alice", "bad")).rejects.toThrow(
      MessengerAuthError,
    );
  });
});
