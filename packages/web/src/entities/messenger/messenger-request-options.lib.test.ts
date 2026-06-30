import { describe, expect, it } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { buildMessengerRequestOptions } from "./messenger-request-options.lib";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "org-a",
    organizationOrigin: "https://org-a.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

describe("messenger request options", () => {
  it("builds messenger request options from runtime context", () => {
    const controller = new AbortController();

    expect(buildMessengerRequestOptions(createRuntimeContext(), undefined, controller.signal)).toEqual(
      {
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: "project-a",
        signal: controller.signal,
      },
    );
  });

  it("keeps explicit overrides for project and dev target origin", () => {
    expect(
      buildMessengerRequestOptions(createRuntimeContext(), {
        baseUrl: "/custom-api",
        devTargetOrigin: "https://override.example.com",
        fetchImpl: fetch,
        projectId: "project-b",
      }),
    ).toMatchObject({
      accessToken: "access-token-a",
      baseUrl: "/custom-api",
      devTargetOrigin: "https://override.example.com",
      fetchImpl: fetch,
      projectId: "project-b",
    });
  });
});
