export const DEFAULT_IAM_TOKEN_URL = "/api/core/v1/iam/clients/default/actions/get_token/invoke";
const SECONDS_PER_DAY = 24 * 60 * 60;
export const DEFAULT_IAM_REFRESH_TOKEN_TTL_SECONDS = 30 * SECONDS_PER_DAY;

// IAM is the source of the project-scoped bearer token for messenger calls.
export interface WorkspaceIamTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  raw: unknown;
}

export interface WorkspaceIamClaims {
  userUuid?: string;
  projectId?: string;
  subject?: string;
  expiresAtSeconds?: number;
}

export interface WorkspaceIamLoginPasswordParams {
  login: string;
  password: string;
  otpCode?: string;
  projectId?: string;
  ttlSeconds?: number;
  refreshTtlSeconds?: number;
}

export interface WorkspaceIamRefreshParams {
  refreshToken: string;
  scope?: string;
}

export interface WorkspaceIamRequestOptions {
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class WorkspaceIamAuthError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "WorkspaceIamAuthError";
    this.status = status;
    this.data = data;
  }
}

export function isWorkspaceIamOtpRequiredError(error: unknown): boolean {
  return error instanceof WorkspaceIamAuthError && error.status === 401;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseWorkspaceIamTokenResponse(data: unknown): WorkspaceIamTokenResponse {
  if (!isRecord(data)) {
    throw new TypeError("Expected IAM token response object");
  }

  const accessToken = stringField(data, "access_token");
  if (accessToken == null) {
    throw new TypeError("Expected IAM access_token");
  }

  return {
    accessToken,
    refreshToken: stringField(data, "refresh_token"),
    expiresIn: numberField(data, "expires_in"),
    raw: data,
  };
}

// Browser code uses the public default IAM client; no client secret is sent.
async function postIamJson(
  body: Record<string, unknown>,
  options: WorkspaceIamRequestOptions,
  headers: Record<string, string> = {},
): Promise<WorkspaceIamTokenResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.tokenUrl ?? DEFAULT_IAM_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const data = response.status === 204 ? null : ((await response.json()) as unknown);

  if (!response.ok) {
    throw new WorkspaceIamAuthError("Workspace IAM token request failed", response.status, data);
  }

  return parseWorkspaceIamTokenResponse(data);
}

export function workspaceIamProjectScope(projectId: string): string {
  return `openid email profile project:${projectId}`;
}

export function workspaceIamBaseScope(): string {
  return "openid email profile";
}

// Login uses the base scope while projects are being discovered; it can also issue
// a project-scoped token for existing callers.
export function requestWorkspaceIamLoginPasswordToken(
  params: WorkspaceIamLoginPasswordParams,
  options: WorkspaceIamRequestOptions = {},
): Promise<WorkspaceIamTokenResponse> {
  const otpCode = params.otpCode?.trim();
  return postIamJson(
    {
      grant_type: "login+password",
      login: params.login,
      password: params.password,
      scope:
        params.projectId == null
          ? workspaceIamBaseScope()
          : workspaceIamProjectScope(params.projectId),
      ttl: params.ttlSeconds ?? 3600,
      refresh_ttl: params.refreshTtlSeconds ?? DEFAULT_IAM_REFRESH_TOKEN_TTL_SECONDS,
    },
    options,
    otpCode == null || otpCode.length === 0 ? {} : { "X-OTP": otpCode },
  );
}

export function refreshWorkspaceIamToken(
  params: WorkspaceIamRefreshParams,
  options: WorkspaceIamRequestOptions = {},
): Promise<WorkspaceIamTokenResponse> {
  return postIamJson(
    {
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      ...(params.scope == null ? {} : { scope: params.scope }),
    },
    options,
  );
}

// JWT claims are decoded only for local routing context, not for trust decisions.
function decodeBase64UrlJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return JSON.parse(decoded) as unknown;
}

function claimString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringField(record, key);
    if (value != null) return value;
  }
  return undefined;
}

export function decodeWorkspaceIamClaims(accessToken: string): WorkspaceIamClaims | null {
  const [, payload] = accessToken.split(".");
  if (payload == null || payload.length === 0) return null;

  try {
    const data = decodeBase64UrlJson(payload);
    if (!isRecord(data)) return null;

    return {
      userUuid: claimString(data, ["user_uuid", "userUuid"]),
      projectId: claimString(data, ["project_id", "projectId"]),
      subject: claimString(data, ["sub"]),
      expiresAtSeconds: numberField(data, "exp"),
    };
  } catch {
    return null;
  }
}
