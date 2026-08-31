import { describe, expect, it, vi } from "vitest";
import {
  getWorkspaceIamIntrospection,
  parseWorkspaceIamIntrospection,
} from "./workspace-iam-introspection.api";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function introspectionResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_info: { uuid: "user-1", name: "User" },
    project_id: "project-1",
    otp_verified: true,
    permissions: [
      "workspace.topic_summary_settings.manage",
      "workspace.topic_summary_endpoint.manage",
    ],
    ...overrides,
  };
}

describe("workspace IAM introspection", () => {
  it("requests the current token context from the organization Core API", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(introspectionResponse()));

    const result = await getWorkspaceIamIntrospection({
      accessToken: " access-token ",
      baseUrl: "https://workspace.example.com/",
      fetchImpl,
      signal: controller.signal,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://workspace.example.com/api/core/v1/iam/clients/default/actions/introspect",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer access-token",
        },
        signal: controller.signal,
      },
    );
    expect(result).toEqual({
      userInfo: { uuid: "user-1" },
      projectId: "project-1",
      otpVerified: true,
      permissions: [
        "workspace.topic_summary_settings.manage",
        "workspace.topic_summary_endpoint.manage",
      ],
    });
  });

  it("accepts the IAM base URL and nullable project id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(introspectionResponse({ project_id: null })));

    const result = await getWorkspaceIamIntrospection({
      accessToken: "token",
      baseUrl: "https://workspace.example.com/api/core/v1/iam",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://workspace.example.com/api/core/v1/iam/clients/default/actions/introspect",
      expect.any(Object),
    );
    expect(result.projectId).toBeNull();
  });

  it.each([
    { user_info: null },
    { user_info: { uuid: "" } },
    { project_id: 7 },
    { otp_verified: "yes" },
    { permissions: null },
    { permissions: ["valid", " "] },
  ])("rejects malformed response %#", (override) => {
    expect(() => parseWorkspaceIamIntrospection(introspectionResponse(override))).toThrow(
      TypeError,
    );
  });

  it("does not request introspection without an access token", async () => {
    const fetchImpl = vi.fn();

    await expect(
      getWorkspaceIamIntrospection({ accessToken: " ", fetchImpl }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves typed HTTP errors with JSON and text response bodies", async () => {
    const jsonFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "denied" }, { status: 403 }));
    const textFetch = vi.fn().mockResolvedValue(new Response("gateway down", { status: 502 }));

    await expect(
      getWorkspaceIamIntrospection({ accessToken: "token", fetchImpl: jsonFetch }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "WorkspaceIamIntrospectionError",
        status: 403,
        data: { message: "denied" },
      }),
    );
    await expect(
      getWorkspaceIamIntrospection({ accessToken: "token", fetchImpl: textFetch }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "WorkspaceIamIntrospectionError",
        status: 502,
        data: "gateway down",
      }),
    );
  });

  it("treats an empty successful response as a contract error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      getWorkspaceIamIntrospection({ accessToken: "token", fetchImpl }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
