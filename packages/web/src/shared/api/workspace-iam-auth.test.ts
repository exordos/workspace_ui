import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_IAM_REFRESH_TOKEN_TTL_SECONDS,
  decodeWorkspaceIamClaims,
  refreshWorkspaceIamToken,
  requestWorkspaceIamLoginPasswordToken,
  workspaceIamProjectScope,
} from "./workspace-iam-auth";

// IAM tests document how the UI gets a project-scoped messenger token.
function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function jwtPayload(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

describe("workspace-iam-auth", () => {
  it("builds the project-scoped IAM scope", () => {
    expect(workspaceIamProjectScope("project-1")).toBe("openid email profile project:project-1");
  });

  it("requests login+password token through the default IAM client", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      }),
    );

    const result = await requestWorkspaceIamLoginPasswordToken(
      { login: "admin", password: "admin", projectId: "project-1" },
      { fetchImpl },
    );

    expect(result).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    });
    expect(DEFAULT_IAM_REFRESH_TOKEN_TTL_SECONDS).toBe(2592000);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/core/v1/iam/clients/default/actions/get_token/invoke",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "login+password",
          login: "admin",
          password: "admin",
          scope: "openid email profile project:project-1",
          ttl: 3600,
          refresh_ttl: DEFAULT_IAM_REFRESH_TOKEN_TTL_SECONDS,
        }),
      }),
    );
  });

  it("refreshes token without sending login credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access_token: "new-token" }));

    await refreshWorkspaceIamToken({ refreshToken: "refresh-token" }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/core/v1/iam/clients/default/actions/get_token/invoke",
      expect.objectContaining({
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "refresh-token",
        }),
      }),
    );
  });

  it("throws typed error for rejected token requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "denied" }, { status: 401 }));

    const promise = requestWorkspaceIamLoginPasswordToken(
      { login: "admin", password: "wrong", projectId: "project-1" },
      { fetchImpl },
    );

    await expect(promise).rejects.toEqual(
      expect.objectContaining({ status: 401, name: "WorkspaceIamAuthError" }),
    );
  });

  it("decodes user and project claims from an access token", () => {
    const token = jwtPayload({
      sub: "subject-1",
      user_uuid: "user-1",
      project_id: "project-1",
      exp: 123,
    });

    expect(decodeWorkspaceIamClaims(token)).toEqual({
      userUuid: "user-1",
      projectId: "project-1",
      subject: "subject-1",
      expiresAtSeconds: 123,
    });
  });

  it("returns null for non-JWT access tokens", () => {
    expect(decodeWorkspaceIamClaims("plain-token")).toBeNull();
  });
});
