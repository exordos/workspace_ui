/**
 * Tests for IAM-backed login (password grant only).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { IamOtpRequiredError, loginWithIamCredentials } from "./iam-auth";
import { jsonResponse, mockFetch } from "./messenger.test.setup";
import { MessengerAuthError } from "./messenger.types";

const IAM_ORIGIN = "https://chat.example.com";
const REALM = "https://chat.example.com";
const USER_UUID = "00000000-0000-0000-0000-000000000000";

function jwtWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("loginWithIamCredentials", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns IAM access token and email from JWT claims", async () => {
    const accessToken = jwtWithClaims({ email: "user@example.com", sub: USER_UUID });
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
      user_id: USER_UUID,
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
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ sub: USER_UUID }) }),
    );

    const result = await loginWithIamCredentials(REALM, "alice", "pw");

    expect(result.email).toBe("alice");
    expect(result.user_id).toBe(USER_UUID);
  });

  it("sends login+password grant payload to IAM", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ email: "u@t.com", sub: USER_UUID }) }),
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
    expect(params.get("scope")).toContain("project:f04648e8-2bdf-4e93-b7bb-aac9850133fe");
  });

  it("forwards OTP code via X-OTP header", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ email: "u@t.com", sub: USER_UUID }) }),
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

  it("throws MessengerAuthError when access token has no user UUID", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: jwtWithClaims({ email: "u@t.com" }) }),
    );

    await expect(loginWithIamCredentials(REALM, "alice", "pw")).rejects.toThrow(MessengerAuthError);
  });

  it("throws MessengerAuthError when IAM login fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Invalid credentials" }, 401));

    await expect(loginWithIamCredentials(REALM, "alice", "bad")).rejects.toThrow(
      MessengerAuthError,
    );
  });
});

describe("refreshIamAccessToken", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns a new access token using refresh_token grant", async () => {
    const accessToken = jwtWithClaims({ email: "user@example.com", sub: USER_UUID });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: accessToken,
        refresh_token: "next-refresh-token",
        token_type: "Bearer",
      }),
    );

    const { refreshIamAccessToken } = await import("./iam-auth");
    const result = await refreshIamAccessToken(IAM_ORIGIN, "old-refresh-token");

    expect(result).toEqual({
      accessToken,
      refreshToken: "next-refresh-token",
    });
    const [, init] = mockFetch.mock.calls[0]!;
    const params = new URLSearchParams(init?.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old-refresh-token");
  });

  it("throws MessengerAuthError when refresh fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Invalid refresh token" }, 401));

    const { refreshIamAccessToken } = await import("./iam-auth");
    await expect(refreshIamAccessToken(IAM_ORIGIN, "bad-refresh")).rejects.toThrow(
      MessengerAuthError,
    );
  });
});
