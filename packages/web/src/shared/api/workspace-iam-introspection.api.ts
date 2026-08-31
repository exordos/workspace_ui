export const DEFAULT_IAM_INTROSPECTION_URL = "/api/core/v1/iam/clients/default/actions/introspect";

export interface WorkspaceIamIntrospectionUserInfo {
  uuid: string;
}

export interface WorkspaceIamIntrospection {
  userInfo: WorkspaceIamIntrospectionUserInfo;
  projectId: string | null;
  otpVerified: boolean;
  permissions: readonly string[];
}

export interface GetWorkspaceIamIntrospectionOptions {
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class WorkspaceIamIntrospectionError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "WorkspaceIamIntrospectionError";
    this.status = status;
    this.data = data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    throw new TypeError(`Expected IAM introspection ${field}`);
  }
  return value;
}

function parsePermissions(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected IAM introspection permissions array");
  }
  return value.map((permission) => requiredString(permission, "permission"));
}

export function parseWorkspaceIamIntrospection(value: unknown): WorkspaceIamIntrospection {
  if (!isRecord(value) || !isRecord(value.user_info)) {
    throw new TypeError("Expected IAM introspection response object");
  }
  if (value.project_id !== null && typeof value.project_id !== "string") {
    throw new TypeError("Expected IAM introspection project_id");
  }
  if (typeof value.otp_verified !== "boolean") {
    throw new TypeError("Expected IAM introspection otp_verified");
  }

  return {
    userInfo: {
      uuid: requiredString(value.user_info.uuid, "user_info.uuid"),
    },
    projectId: value.project_id === null ? null : requiredString(value.project_id, "project_id"),
    otpVerified: value.otp_verified,
    permissions: parsePermissions(value.permissions),
  };
}

function introspectionUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (normalizedBaseUrl.endsWith("/actions/introspect")) return normalizedBaseUrl;
  if (normalizedBaseUrl.endsWith("/iam")) {
    return `${normalizedBaseUrl}/clients/default/actions/introspect`;
  }
  return `${normalizedBaseUrl}/api/core/v1/iam/clients/default/actions/introspect`;
}

async function readResponseData(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length === 0) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

export async function getWorkspaceIamIntrospection(
  options: GetWorkspaceIamIntrospectionOptions,
): Promise<WorkspaceIamIntrospection> {
  const accessToken = options.accessToken.trim();
  if (accessToken.length === 0) {
    throw new TypeError("Expected IAM access token");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    introspectionUrl(options.baseUrl ?? DEFAULT_IAM_INTROSPECTION_URL),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: options.signal,
    },
  );
  const data = await readResponseData(response);
  if (!response.ok) {
    throw new WorkspaceIamIntrospectionError(
      "Workspace IAM introspection request failed",
      response.status,
      data,
    );
  }

  return parseWorkspaceIamIntrospection(data);
}
