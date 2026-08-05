import { describe, expect, it, vi } from "vitest";
import {
  getWorkspaceIamProjects,
  parseWorkspaceIamProjects,
  WorkspaceIamProjectsError,
} from "./workspace-iam-projects.api";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const project = {
  uuid: "project-1",
  name: "Workspace",
  description: null,
  status: "active",
  organization: { uuid: "organization-1", name: "Acme" },
};

describe("workspace-iam-projects", () => {
  it("gets available projects using the temporary bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([project]));

    await expect(
      getWorkspaceIamProjects({ accessToken: " temporary-token ", fetchImpl }),
    ).resolves.toEqual([project]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/core/v1/iam/projects/",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json", Authorization: "Bearer temporary-token" },
      }),
    );
  });

  it("returns an empty project list for a successful no-content response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(getWorkspaceIamProjects({ accessToken: "token", fetchImpl })).resolves.toEqual([]);
  });

  it("supports a Core gateway base URL and RESTAlchemy collection envelopes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [project] }));

    await expect(
      getWorkspaceIamProjects({
        accessToken: "temporary-token",
        baseUrl: "https://core.example/api/core/v1/iam/",
        fetchImpl,
      }),
    ).resolves.toEqual([project]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://core.example/api/core/v1/iam/projects/",
      expect.anything(),
    );
  });

  it("accepts an organization origin as the base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([project]));

    await getWorkspaceIamProjects({
      accessToken: "temporary-token",
      baseUrl: "https://organization.example/",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://organization.example/api/core/v1/iam/projects/",
      expect.anything(),
    );
  });

  it("filters malformed project rows but rejects a non-collection response", () => {
    expect(parseWorkspaceIamProjects([project, { uuid: "bad" }])).toEqual([project]);
    expect(() => parseWorkspaceIamProjects({ project })).toThrow(
      "Expected IAM projects response to be an array",
    );
  });

  it("keeps each project once when multiple IAM roles return duplicate rows", () => {
    expect(
      parseWorkspaceIamProjects([
        project,
        { ...project },
        { ...project, uuid: "project-2", name: "Engineering" },
      ]),
    ).toEqual([project, { ...project, uuid: "project-2", name: "Engineering" }]);
  });

  it("throws a typed error for rejected requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: "denied" }, { status: 403 }));

    await expect(
      getWorkspaceIamProjects({ accessToken: "token", fetchImpl }),
    ).rejects.toBeInstanceOf(WorkspaceIamProjectsError);
  });
});
