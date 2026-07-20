export const DEFAULT_IAM_PROJECTS_BASE_URL = "/api/core/v1/iam";

export interface WorkspaceIamProjectOrganizationDto {
  uuid: string;
  name: string | null;
}

export interface WorkspaceIamProject {
  uuid: string;
  name: string;
  description: string | null;
  status: string;
  organization: WorkspaceIamProjectOrganizationDto | null;
}

export interface GetWorkspaceIamProjectsOptions {
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class WorkspaceIamProjectsError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "WorkspaceIamProjectsError";
    this.status = status;
    this.data = data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseOrganization(value: unknown): WorkspaceIamProjectOrganizationDto | null {
  if (!isRecord(value)) return null;
  const uuid = requiredString(value.uuid);
  if (uuid == null) return null;
  return { uuid, name: nullableString(value.name) };
}

export function parseWorkspaceIamProject(value: unknown): WorkspaceIamProject | null {
  if (!isRecord(value)) return null;
  const uuid = requiredString(value.uuid);
  const name = requiredString(value.name);
  const status = requiredString(value.status);
  if (uuid == null || name == null || status == null) return null;

  return {
    uuid,
    name,
    description: nullableString(value.description),
    status,
    organization: parseOrganization(value.organization),
  };
}

// RESTAlchemy collections are normally arrays. Older Core gateways may wrap them.
function unwrapProjectCollection(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return value;
  for (const key of ["items", "data", "results", "objects"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return value;
}

export function parseWorkspaceIamProjects(value: unknown): WorkspaceIamProject[] {
  const collection = unwrapProjectCollection(value);
  if (!Array.isArray(collection)) {
    throw new TypeError("Expected IAM projects response to be an array");
  }

  return collection.flatMap((item) => {
    const project = parseWorkspaceIamProject(item);
    return project == null ? [] : [project];
  });
}

function projectsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const iamBaseUrl = normalizedBaseUrl.endsWith("/iam")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api/core/v1/iam`;
  return `${iamBaseUrl}/projects/`;
}

export async function getWorkspaceIamProjects(
  options: GetWorkspaceIamProjectsOptions,
): Promise<WorkspaceIamProject[]> {
  const accessToken = options.accessToken.trim();
  if (accessToken.length === 0) {
    throw new TypeError("Expected IAM access token");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(projectsUrl(options.baseUrl ?? DEFAULT_IAM_PROJECTS_BASE_URL), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  });
  if (!response.ok) {
    const data = (await response.json()) as unknown;
    throw new WorkspaceIamProjectsError(
      "Workspace IAM projects request failed",
      response.status,
      data,
    );
  }

  if (response.status === 204) return [];

  const data = (await response.json()) as unknown;
  return parseWorkspaceIamProjects(data);
}
