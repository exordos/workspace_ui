import { getServerSettings } from "~/shared/api/messenger-client";
import type { WorkspaceMessengerServerSettingsDto } from "~/shared/api/messenger.types";
import {
  DEFAULT_IAM_TOKEN_URL,
  decodeWorkspaceIamClaims,
  refreshWorkspaceIamToken,
  requestWorkspaceIamLoginPasswordToken,
} from "~/shared/api/workspace-iam-auth";
import { getWorkspaceMessengerAuthProfile } from "~/shared/api/workspace-messenger-profile.api";
import { env } from "~/shared/lib/env";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { buildOrgRouteIdFromRealm } from "~/shared/lib/org-route";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { useWorkspaceAuthStore } from "./workspace-auth.model";
import type { WorkspaceAuthProfile, WorkspaceAuthSession } from "./workspace-auth.model";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const authLogger = createLogger("auth:workspace");
let instanceIdFallbackCounter = 0;

export interface LoginWorkspaceWithPasswordParams {
  organizationUrl: string;
  login: string;
  password: string;
  projectId?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface LoginWorkspaceWithPasswordResult {
  session: WorkspaceAuthSession;
  serverSettings: WorkspaceMessengerServerSettingsDto;
}

export class WorkspaceAuthFlowError extends Error {
  readonly code:
    | "missing-project"
    | "missing-claims"
    | "project-mismatch"
    | "profile-load-failed"
    | "refresh-unavailable";

  constructor(code: WorkspaceAuthFlowError["code"], message: string) {
    super(message);
    this.name = "WorkspaceAuthFlowError";
    this.code = code;
  }
}

function joinOriginPath(origin: string, path: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanOrigin}${cleanPath}`;
}

function messengerBaseUrlForOrganizationOrigin(origin: string): string {
  return joinOriginPath(origin, "/api/messenger/v1");
}

function iamTokenUrlForOrganizationOrigin(origin: string): string {
  return joinOriginPath(origin, DEFAULT_IAM_TOKEN_URL);
}

function expiresAtMsFromToken(expiresIn: number | undefined, expiresAtSeconds: number | undefined) {
  if (expiresAtSeconds != null && Number.isFinite(expiresAtSeconds)) {
    return Math.trunc(expiresAtSeconds * 1000);
  }
  if (expiresIn != null && Number.isFinite(expiresIn)) {
    return Date.now() + Math.trunc(expiresIn * 1000);
  }
  return undefined;
}

function profileFromWorkspaceUser(
  user: Awaited<ReturnType<typeof getWorkspaceMessengerAuthProfile>>,
  fallbackLogin: string,
): WorkspaceAuthProfile {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const fallbackUsername = fallbackLogin.trim();
  return {
    uuid: user.uuid,
    username:
      user.username?.trim() || fullName || user.email?.trim() || fallbackUsername || user.uuid,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    ...(user.status != null ? { status: user.status } : {}),
  };
}

function fallbackProfileFromIdentity(userUuid: string, login: string): WorkspaceAuthProfile {
  const normalizedLogin = login.trim();
  const username = normalizedLogin.length > 0 ? normalizedLogin : userUuid;
  return {
    uuid: userUuid,
    username,
    firstName: null,
    lastName: null,
    email: normalizedLogin.includes("@") ? normalizedLogin : null,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function loadWorkspaceProfileOrFallback(params: {
  accessToken: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  userUuid: string;
  login: string;
}): Promise<WorkspaceAuthProfile> {
  try {
    const profileDto = await getWorkspaceMessengerAuthProfile(
      {
        accessToken: params.accessToken,
        baseUrl: params.baseUrl,
        fetchImpl: params.fetchImpl,
        signal: params.signal,
      },
      params.userUuid,
    );
    if (profileDto.uuid !== params.userUuid) {
      throw new WorkspaceAuthFlowError(
        "profile-load-failed",
        "Workspace profile does not match token user",
      );
    }
    return profileFromWorkspaceUser(profileDto, params.login);
  } catch (error) {
    if (error instanceof WorkspaceAuthFlowError || isAbortError(error)) {
      throw error;
    }
    authLogger.warn("Workspace profile unavailable during login", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return fallbackProfileFromIdentity(params.userUuid, params.login);
  }
}

function userUuidFromClaims(
  claims: ReturnType<typeof decodeWorkspaceIamClaims>,
): string | undefined {
  return claims?.userUuid ?? claims?.subject;
}

function generateInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  instanceIdFallbackCounter += 1;
  return `workspace-${Date.now().toString(36)}-${instanceIdFallbackCounter.toString(36)}`;
}

export function buildWorkspaceAccountId(input: {
  organizationId: string;
  projectId: string;
  userUuid: string;
}): string {
  return `${input.organizationId}:${input.projectId}:${input.userUuid}`;
}

export function getDefaultWorkspaceProjectId(): string {
  return env.DEFAULT_WORKSPACE_PROJECT_ID.trim();
}

export async function fetchWorkspaceServerSettingsForOrganization(
  organizationUrl: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<WorkspaceMessengerServerSettingsDto> {
  const organizationOrigin = workspaceOrgOriginFromLoginServerUrlInput(organizationUrl);
  const safeOrigin = guard.nonEmpty(organizationOrigin, "workspaceAuth.organizationOrigin");
  return getServerSettings({
    baseUrl: messengerBaseUrlForOrganizationOrigin(safeOrigin),
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
}

export function shouldRefreshWorkspaceSession(session: Pick<WorkspaceAuthSession, "expiresAtMs">) {
  return session.expiresAtMs != null && session.expiresAtMs - Date.now() <= TOKEN_REFRESH_SKEW_MS;
}

export async function loginWorkspaceWithPassword({
  organizationUrl,
  login,
  password,
  projectId = getDefaultWorkspaceProjectId(),
  fetchImpl,
  signal,
}: LoginWorkspaceWithPasswordParams): Promise<LoginWorkspaceWithPasswordResult> {
  const organizationOrigin = workspaceOrgOriginFromLoginServerUrlInput(organizationUrl);
  const trimmedProjectId = projectId.trim();
  if (trimmedProjectId.length === 0) {
    throw new WorkspaceAuthFlowError(
      "missing-project",
      "Default Workspace project id is not configured",
    );
  }
  const safeOrigin = guard.nonEmpty(organizationOrigin, "workspaceAuth.organizationOrigin");
  const messengerBaseUrl = messengerBaseUrlForOrganizationOrigin(safeOrigin);
  const tokenUrl = iamTokenUrlForOrganizationOrigin(safeOrigin);

  const serverSettings = await fetchWorkspaceServerSettingsForOrganization(organizationUrl, {
    fetchImpl,
    signal,
  });
  const token = await requestWorkspaceIamLoginPasswordToken(
    {
      login: login.trim(),
      password,
      projectId: trimmedProjectId,
    },
    { tokenUrl, fetchImpl, signal },
  );
  const claims = decodeWorkspaceIamClaims(token.accessToken);
  const userUuid = userUuidFromClaims(claims);
  const tokenProjectId = claims?.projectId;
  if (userUuid == null) {
    throw new WorkspaceAuthFlowError("missing-claims", "Workspace IAM token has no owner claims");
  }
  if (tokenProjectId != null && tokenProjectId !== trimmedProjectId) {
    throw new WorkspaceAuthFlowError("project-mismatch", "Workspace IAM token project mismatch");
  }

  const profile = await loadWorkspaceProfileOrFallback({
    accessToken: token.accessToken,
    baseUrl: messengerBaseUrl,
    fetchImpl,
    signal,
    userUuid,
    login,
  });

  const organizationId = buildOrgRouteIdFromRealm(safeOrigin);
  const accountId = buildWorkspaceAccountId({
    organizationId,
    projectId: trimmedProjectId,
    userUuid,
  });
  const existing = useWorkspaceAuthStore
    .getState()
    .sessions.find((session) => session.accountId === accountId);
  const session: WorkspaceAuthSession = {
    accountId,
    instanceId: existing?.instanceId ?? generateInstanceId(),
    organizationId,
    organizationOrigin: safeOrigin,
    projectId: trimmedProjectId,
    userUuid,
    login: login.trim(),
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAtMs: expiresAtMsFromToken(token.expiresIn, claims?.expiresAtSeconds),
    profile,
    runtimeGeneration: existing?.runtimeGeneration ?? 0,
  };

  useWorkspaceAuthStore.getState().setSession(session);
  return {
    session: useWorkspaceAuthStore.getState().getCurrentSession() ?? session,
    serverSettings,
  };
}

export async function refreshWorkspaceSession(accountId: string): Promise<boolean> {
  const store = useWorkspaceAuthStore.getState();
  const session = store.sessions.find((item) => item.accountId === accountId);
  if (session?.refreshToken == null || session.refreshToken.trim() === "") {
    throw new WorkspaceAuthFlowError("refresh-unavailable", "Workspace refresh token is missing");
  }

  try {
    const token = await refreshWorkspaceIamToken(
      { refreshToken: session.refreshToken },
      { tokenUrl: iamTokenUrlForOrganizationOrigin(session.organizationOrigin) },
    );
    const claims = decodeWorkspaceIamClaims(token.accessToken);
    const userUuid = userUuidFromClaims(claims);
    if (userUuid == null || userUuid !== session.userUuid) {
      useWorkspaceAuthStore.getState().removeSession(accountId);
      return false;
    }
    if (claims?.projectId != null && claims.projectId !== session.projectId) {
      useWorkspaceAuthStore.getState().removeSession(accountId);
      return false;
    }
    useWorkspaceAuthStore.getState().updateTokens(accountId, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAtMs: expiresAtMsFromToken(token.expiresIn, claims?.expiresAtSeconds),
    });
    return true;
  } catch {
    useWorkspaceAuthStore.getState().removeSession(accountId);
    return false;
  }
}

export function removeWorkspaceSession(accountId: string): void {
  useWorkspaceAuthStore.getState().removeSession(accountId);
}
