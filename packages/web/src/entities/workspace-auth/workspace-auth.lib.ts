import { useWorkspaceComposerDraftStore } from "~/entities/composer-draft/composer-draft.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { getServerSettings } from "~/shared/api/messenger-client";
import type { WorkspaceMessengerServerSettingsDto } from "~/shared/api/messenger.types";
import {
  DEFAULT_IAM_TOKEN_URL,
  decodeWorkspaceIamClaims,
  refreshWorkspaceIamToken,
  requestWorkspaceIamLoginPasswordToken,
  workspaceIamProjectScope,
  WorkspaceIamAuthError,
} from "~/shared/api/workspace-iam-auth";
import {
  getWorkspaceIamProjects,
  type WorkspaceIamProject,
} from "~/shared/api/workspace-iam-projects.api";
import { getWorkspaceMessengerAuthProfile } from "~/shared/api/workspace-messenger-profile.api";
import { env } from "~/shared/lib/env";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import { buildOrgRouteIdFromOrigin } from "~/shared/lib/org-route";
import { deleteWorkspaceExternalAccountOwnerCache } from "~/shared/lib/workspace-external-account-cache-db";
import { deleteWorkspaceMessengerOwnerCache } from "~/shared/lib/workspace-messenger-cache-db";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";
import { deleteWorkspaceUserOwnerCache } from "~/shared/lib/workspace-user-cache-db";
import { useWorkspaceAuthStore } from "./workspace-auth.model";
import type { WorkspaceAuthProfile, WorkspaceAuthSession } from "./workspace-auth.model";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const TERMINAL_REFRESH_FAILURE_WINDOW_MS = 60_000;
const TERMINAL_REFRESH_FAILURE_REMOVAL_THRESHOLD = 3;
const authLogger = createLogger("auth:workspace");
const pendingWorkspaceSessionRefreshes = new Map<string, Promise<WorkspaceAuthSession>>();
const terminalRefreshFailureAttemptsByAccountId = new Map<
  string,
  { count: number; firstFailureAtMs: number }
>();
let instanceIdFallbackCounter = 0;

type WorkspaceSessionRemovalReason =
  | "explicit-logout"
  | "owner-mismatch"
  | "terminal-refresh-failure";

interface WorkspaceSessionRemovalDecision {
  remove: boolean;
  terminalAttemptCount?: number;
  terminalAttemptThreshold?: number;
  terminalAttemptWindowMs?: number;
}

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

export interface WorkspaceAuthProject {
  id: string;
  name: string;
  description?: string;
  organizationName?: string;
}

export interface PrepareWorkspaceProjectLoginParams {
  organizationUrl: string;
  login: string;
  password: string;
  otpCode?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface PreparedWorkspaceProjectLogin {
  readonly organizationUrl: string;
  readonly organizationOrigin: string;
  readonly login: string;
  readonly userUuid: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly projects: readonly WorkspaceAuthProject[];
}

export interface CompleteWorkspaceProjectLoginParams {
  preparedLogin: PreparedWorkspaceProjectLogin;
  projectId: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class WorkspaceAuthFlowError extends Error {
  readonly code:
    | "missing-project"
    | "missing-refresh-token"
    | "missing-claims"
    | "project-mismatch"
    | "profile-load-failed"
    | "owner-mismatch"
    | "refresh-unavailable";

  constructor(code: WorkspaceAuthFlowError["code"], message: string) {
    super(message);
    this.name = "WorkspaceAuthFlowError";
    this.code = code;
  }
}

export type WorkspaceAuthRefreshFailure =
  | { reason: "transient-failed"; error: unknown }
  | { reason: "refresh-expired"; status?: number; error: unknown }
  | { reason: "owner-mismatch"; error: unknown }
  | { reason: "network-offline"; error: unknown }
  | { reason: "server-unavailable"; status?: number; error: unknown }
  | { reason: "unknown-transient"; error: unknown };

function joinOriginPath(origin: string, path: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanOrigin}${cleanPath}`;
}

function messengerBaseUrlForOrganizationOrigin(origin: string): string {
  return joinOriginPath(origin, "/api/workspace/v1/messenger");
}

function workspaceBaseUrlForOrganizationOrigin(origin: string): string {
  return joinOriginPath(origin, "/api/workspace/v1");
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
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownErrorText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (!isRecord(value)) return "";
  const textFields = ["error", "error_description", "message", "detail", "code"];
  return textFields
    .map((field) => value[field])
    .filter((fieldValue): fieldValue is string => typeof fieldValue === "string")
    .join(" ")
    .toLowerCase();
}

function normalizeAuthErrorMarker(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasAuthErrorMarker(text: string, marker: string): boolean {
  const normalizedText = normalizeAuthErrorMarker(text);
  return `_${normalizedText}_`.includes(`_${marker}_`);
}

function knownErrorCodeTexts(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const codeFields = ["error", "code", "error_code", "errorCode", "reason", "type"];
  return codeFields
    .map((field) => value[field])
    .filter((fieldValue): fieldValue is string => typeof fieldValue === "string");
}

function hasExplicitTerminalRefreshMarker(data: unknown): boolean {
  const text = knownErrorText(data);
  if (
    hasAuthErrorMarker(text, "invalid_grant") ||
    hasAuthErrorMarker(text, "invalid_token") ||
    hasAuthErrorMarker(text, "revoked")
  ) {
    return true;
  }

  const terminalCodes = new Set([
    "expired_token",
    "invalid_refresh_token",
    "refresh_token_expired",
    "refresh_token_invalid",
    "refresh_token_revoked",
    "revoked_token",
    "token_expired",
    "token_revoked",
  ]);
  return knownErrorCodeTexts(data).some((codeText) =>
    terminalCodes.has(normalizeAuthErrorMarker(codeText)),
  );
}

function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return message.includes("fetch") || message.includes("network") || message.includes("offline");
}

function isRefreshTokenAuthRejection(error: unknown): error is WorkspaceIamAuthError {
  if (!(error instanceof WorkspaceIamAuthError)) return false;
  if (error.status !== 400 && error.status !== 401 && error.status !== 403) return false;
  return hasExplicitTerminalRefreshMarker(error.data);
}

function isServerUnavailable(error: unknown): error is WorkspaceIamAuthError {
  return (
    error instanceof WorkspaceIamAuthError &&
    (error.status === 408 || error.status === 429 || error.status >= 500)
  );
}

function resetTerminalRefreshFailureAttempts(accountId: string): void {
  terminalRefreshFailureAttemptsByAccountId.delete(accountId);
}

function shouldRemoveAfterTerminalRefreshFailure(
  accountId: string,
  nowMs = Date.now(),
): WorkspaceSessionRemovalDecision {
  const current = terminalRefreshFailureAttemptsByAccountId.get(accountId);
  const isWithinWindow =
    current != null && nowMs - current.firstFailureAtMs <= TERMINAL_REFRESH_FAILURE_WINDOW_MS;
  const nextAttempt = {
    count: isWithinWindow ? current.count + 1 : 1,
    firstFailureAtMs: isWithinWindow ? current.firstFailureAtMs : nowMs,
  };

  if (nextAttempt.count >= TERMINAL_REFRESH_FAILURE_REMOVAL_THRESHOLD) {
    resetTerminalRefreshFailureAttempts(accountId);
    return {
      remove: true,
      terminalAttemptCount: nextAttempt.count,
      terminalAttemptThreshold: TERMINAL_REFRESH_FAILURE_REMOVAL_THRESHOLD,
      terminalAttemptWindowMs: TERMINAL_REFRESH_FAILURE_WINDOW_MS,
    };
  }

  terminalRefreshFailureAttemptsByAccountId.set(accountId, nextAttempt);
  return {
    remove: false,
    terminalAttemptCount: nextAttempt.count,
    terminalAttemptThreshold: TERMINAL_REFRESH_FAILURE_REMOVAL_THRESHOLD,
    terminalAttemptWindowMs: TERMINAL_REFRESH_FAILURE_WINDOW_MS,
  };
}

function sessionRemovalDecisionAfterRefreshFailure(
  accountId: string,
  failure: WorkspaceAuthRefreshFailure,
): WorkspaceSessionRemovalDecision {
  if (failure.reason === "owner-mismatch") {
    resetTerminalRefreshFailureAttempts(accountId);
    return { remove: true };
  }
  if (failure.reason === "refresh-expired") {
    return shouldRemoveAfterTerminalRefreshFailure(accountId);
  }
  resetTerminalRefreshFailureAttempts(accountId);
  return { remove: false };
}

function abortSignalError(): Error {
  const error = new Error("Workspace auth refresh aborted");
  error.name = "AbortError";
  return error;
}

function promiseRejectionError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Workspace auth refresh failed");
}

function raceWithAbortSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal == null) return promise;
  if (signal.aborted) return Promise.reject(abortSignalError());

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortSignalError());
    signal.addEventListener("abort", abort, { once: true });
    void promise
      .then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", abort);
          reject(promiseRejectionError(error));
        },
      )
      .catch((error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(promiseRejectionError(error));
      });
  });
}

function findWorkspaceSession(accountId: string): WorkspaceAuthSession | undefined {
  return useWorkspaceAuthStore
    .getState()
    .sessions.find((session) => session.accountId === accountId);
}

async function cleanupWorkspaceMessengerOwnerCache(
  session: WorkspaceAuthSession | undefined,
): Promise<void> {
  if (session == null) return;
  const ownerKey = workspaceRuntimeOwnerKey(session);
  try {
    await useWorkspaceComposerDraftStore.getState().disposeOwner(ownerKey);
  } catch (error) {
    authLogger.warn("Workspace composer draft disposal failed during session removal", {
      accountId: session.accountId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
  try {
    await deleteWorkspaceMessengerOwnerCache(ownerKey);
  } catch (error) {
    authLogger.warn("Workspace messenger cache cleanup failed during session removal", {
      accountId: session.accountId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function cleanupWorkspaceUserOwnerCache(
  session: WorkspaceAuthSession | undefined,
): Promise<void> {
  if (session == null) return;
  const ownerKey = workspaceRuntimeOwnerKey(session);
  try {
    await deleteWorkspaceUserOwnerCache(ownerKey);
  } catch (error) {
    authLogger.warn("Workspace user cache cleanup failed during session removal", {
      accountId: session.accountId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function cleanupWorkspaceExternalAccountOwnerCache(
  session: WorkspaceAuthSession | undefined,
): Promise<void> {
  if (session == null) return;
  const ownerKey = workspaceRuntimeOwnerKey(session);
  try {
    await deleteWorkspaceExternalAccountOwnerCache(ownerKey);
  } catch (error) {
    authLogger.warn("Workspace external account cache cleanup failed during session removal", {
      accountId: session.accountId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

async function cleanupWorkspaceOwnerCaches(
  session: WorkspaceAuthSession | undefined,
): Promise<void> {
  await Promise.all([
    cleanupWorkspaceMessengerOwnerCache(session),
    cleanupWorkspaceUserOwnerCache(session),
    cleanupWorkspaceExternalAccountOwnerCache(session),
  ]);
}

async function removeWorkspaceSessionAfterCacheCleanup(
  accountId: string,
  session: WorkspaceAuthSession | undefined = findWorkspaceSession(accountId),
  reason: WorkspaceSessionRemovalReason = "explicit-logout",
): Promise<void> {
  authLogger.warn("Workspace session removal requested", {
    accountId,
    reason,
    sessionPresent: session != null,
    organizationId: session?.organizationId,
    projectId: session?.projectId,
    userUuid: session?.userUuid,
  });
  resetTerminalRefreshFailureAttempts(accountId);
  await cleanupWorkspaceOwnerCaches(session);
  useWorkspaceAuthStore.getState().removeSession(accountId);
  authLogger.warn("Workspace session removed", {
    accountId,
    reason,
    sessionPresentBeforeRemoval: session != null,
  });
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

function workspaceProjectFromIamDto(value: WorkspaceIamProject): WorkspaceAuthProject {
  const description = value.description?.trim();
  const organizationName = value.organization?.name?.trim();
  return {
    id: value.uuid,
    name: value.name,
    ...(description != null && description.length > 0 ? { description } : {}),
    ...(organizationName != null && organizationName.length > 0 ? { organizationName } : {}),
  };
}

function resolveWorkspaceRefreshOwnerMismatch(
  session: WorkspaceAuthSession,
  claims: ReturnType<typeof decodeWorkspaceIamClaims>,
): string | null {
  const tokenUserUuid = userUuidFromClaims(claims);
  if (tokenUserUuid != null && tokenUserUuid !== session.userUuid) {
    return "user_uuid";
  }
  if (claims?.projectId != null && claims.projectId !== session.projectId) {
    return "project_id";
  }
  return null;
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

export function classifyWorkspaceAuthRefreshError(error: unknown): WorkspaceAuthRefreshFailure {
  if (error instanceof WorkspaceAuthFlowError && error.code === "owner-mismatch") {
    return { reason: "owner-mismatch", error };
  }
  if (isRefreshTokenAuthRejection(error)) {
    return { reason: "refresh-expired", status: error.status, error };
  }
  if (isNavigatorOffline() || isNetworkError(error)) {
    return { reason: "network-offline", error };
  }
  if (isServerUnavailable(error)) {
    return { reason: "server-unavailable", status: error.status, error };
  }
  if (isAbortError(error) || error instanceof WorkspaceIamAuthError) {
    return { reason: "transient-failed", error };
  }
  return { reason: "unknown-transient", error };
}

async function refreshWorkspaceAuthSessionOnce(
  session: WorkspaceAuthSession,
  signal: AbortSignal | undefined,
): Promise<WorkspaceAuthSession> {
  if (session.refreshToken == null || session.refreshToken.trim() === "") {
    throw new WorkspaceAuthFlowError("refresh-unavailable", "Workspace refresh token is missing");
  }

  const token = await refreshWorkspaceIamToken(
    { refreshToken: session.refreshToken },
    { tokenUrl: iamTokenUrlForOrganizationOrigin(session.organizationOrigin), signal },
  );
  const claims = decodeWorkspaceIamClaims(token.accessToken);
  const ownerMismatchClaim = resolveWorkspaceRefreshOwnerMismatch(session, claims);
  if (ownerMismatchClaim != null) {
    authLogger.warn("Workspace refresh token owner claim mismatch", {
      accountId: session.accountId,
      organizationId: session.organizationId,
      projectId: session.projectId,
      userUuid: session.userUuid,
      claim: ownerMismatchClaim,
      tokenUserUuid: userUuidFromClaims(claims),
      tokenProjectId: claims?.projectId,
      hasClaims: claims != null,
    });
    throw new WorkspaceAuthFlowError(
      "owner-mismatch",
      "Workspace refresh token returned another owner",
    );
  }
  if (claims?.projectId == null) {
    authLogger.warn("Workspace refresh token returned incomplete local claims", {
      accountId: session.accountId,
      organizationId: session.organizationId,
      projectId: session.projectId,
      userUuid: session.userUuid,
      hasClaims: claims != null,
      hasUserUuid: userUuidFromClaims(claims) != null,
      hasProjectId: claims?.projectId != null,
    });
  }

  useWorkspaceAuthStore.getState().updateTokens(session.accountId, {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? session.refreshToken,
    expiresAtMs: expiresAtMsFromToken(token.expiresIn, claims?.expiresAtSeconds),
  });

  const refreshedSession = findWorkspaceSession(session.accountId);
  if (refreshedSession == null) {
    throw new WorkspaceAuthFlowError(
      "refresh-unavailable",
      "Workspace session disappeared during refresh",
    );
  }
  return refreshedSession;
}

async function refreshWorkspaceAuthSessionForAccount(
  session: WorkspaceAuthSession,
): Promise<WorkspaceAuthSession> {
  try {
    const refreshedSession = await refreshWorkspaceAuthSessionOnce(session, undefined);
    resetTerminalRefreshFailureAttempts(session.accountId);
    authLogger.info("Workspace auth refresh succeeded", {
      accountId: session.accountId,
      organizationId: session.organizationId,
      projectId: session.projectId,
      userUuid: session.userUuid,
      refreshTokenRotated: refreshedSession.refreshToken !== session.refreshToken,
      expiresAtMs: refreshedSession.expiresAtMs,
    });
    return refreshedSession;
  } catch (error) {
    const failure = classifyWorkspaceAuthRefreshError(error);
    const removalDecision = sessionRemovalDecisionAfterRefreshFailure(session.accountId, failure);
    authLogger.warn("Workspace auth refresh failed", {
      accountId: session.accountId,
      organizationId: session.organizationId,
      projectId: session.projectId,
      userUuid: session.userUuid,
      reason: failure.reason,
      status: "status" in failure ? failure.status : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : undefined,
      willRemoveSession: removalDecision.remove,
      terminalAttemptCount: removalDecision.terminalAttemptCount,
      terminalAttemptThreshold: removalDecision.terminalAttemptThreshold,
      terminalAttemptWindowMs: removalDecision.terminalAttemptWindowMs,
    });
    if (removalDecision.remove) {
      await removeWorkspaceSessionAfterCacheCleanup(
        session.accountId,
        session,
        failure.reason === "owner-mismatch" ? "owner-mismatch" : "terminal-refresh-failure",
      );
    }
    throw error;
  }
}

export function ensureFreshWorkspaceSession(
  accountId: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<WorkspaceAuthSession> {
  const session = findWorkspaceSession(accountId);
  if (session == null) {
    return Promise.reject(
      new WorkspaceAuthFlowError("refresh-unavailable", "Workspace session is missing"),
    );
  }
  if (options.force !== true && !shouldRefreshWorkspaceSession(session)) {
    return Promise.resolve(session);
  }
  if (options.signal?.aborted === true) {
    return Promise.reject(abortSignalError());
  }

  const pending = pendingWorkspaceSessionRefreshes.get(accountId);
  if (pending != null) {
    return raceWithAbortSignal(pending, options.signal);
  }

  const refreshPromise = refreshWorkspaceAuthSessionForAccount(session);
  pendingWorkspaceSessionRefreshes.set(accountId, refreshPromise);
  void refreshPromise
    .finally(() => {
      if (pendingWorkspaceSessionRefreshes.get(accountId) === refreshPromise) {
        pendingWorkspaceSessionRefreshes.delete(accountId);
      }
    })
    .catch(() => undefined);
  return raceWithAbortSignal(refreshPromise, options.signal);
}

export async function prepareWorkspaceProjectLogin({
  organizationUrl,
  login,
  password,
  otpCode,
  fetchImpl,
  signal,
}: PrepareWorkspaceProjectLoginParams): Promise<PreparedWorkspaceProjectLogin> {
  const organizationOrigin = workspaceOrgOriginFromLoginServerUrlInput(organizationUrl);
  const safeOrigin = guard.nonEmpty(organizationOrigin, "workspaceAuth.organizationOrigin");
  const token = await requestWorkspaceIamLoginPasswordToken(
    { login: login.trim(), password, ...(otpCode == null ? {} : { otpCode }) },
    { tokenUrl: iamTokenUrlForOrganizationOrigin(safeOrigin), fetchImpl, signal },
  );
  const refreshToken = token.refreshToken?.trim();
  if (refreshToken == null || refreshToken.length === 0) {
    throw new WorkspaceAuthFlowError(
      "missing-refresh-token",
      "Workspace IAM login did not return a refresh token",
    );
  }

  const claims = decodeWorkspaceIamClaims(token.accessToken);
  const userUuid = userUuidFromClaims(claims);
  if (userUuid == null) {
    throw new WorkspaceAuthFlowError("missing-claims", "Workspace IAM token has no owner claims");
  }

  const iamProjects = await getWorkspaceIamProjects({
    accessToken: token.accessToken,
    baseUrl: safeOrigin,
    fetchImpl,
    signal,
  });
  const projects = iamProjects.map(workspaceProjectFromIamDto);

  return {
    organizationUrl,
    organizationOrigin: safeOrigin,
    login: login.trim(),
    userUuid,
    accessToken: token.accessToken,
    refreshToken,
    projects,
  };
}

export async function completeWorkspaceProjectLogin({
  preparedLogin,
  projectId,
  fetchImpl,
  signal,
}: CompleteWorkspaceProjectLoginParams): Promise<LoginWorkspaceWithPasswordResult> {
  const trimmedProjectId = projectId.trim();
  if (!preparedLogin.projects.some((project) => project.id === trimmedProjectId)) {
    throw new WorkspaceAuthFlowError(
      "missing-project",
      "Selected Workspace project is unavailable",
    );
  }

  const token = await refreshWorkspaceIamToken(
    {
      refreshToken: preparedLogin.refreshToken,
      scope: workspaceIamProjectScope(trimmedProjectId),
    },
    {
      tokenUrl: iamTokenUrlForOrganizationOrigin(preparedLogin.organizationOrigin),
      fetchImpl,
      signal,
    },
  );
  const claims = decodeWorkspaceIamClaims(token.accessToken);
  const userUuid = userUuidFromClaims(claims);
  if (userUuid == null) {
    throw new WorkspaceAuthFlowError("missing-claims", "Workspace IAM token has no owner claims");
  }
  if (userUuid !== preparedLogin.userUuid) {
    throw new WorkspaceAuthFlowError("owner-mismatch", "Workspace IAM token user mismatch");
  }
  if (claims?.projectId != null && claims.projectId !== trimmedProjectId) {
    throw new WorkspaceAuthFlowError("project-mismatch", "Workspace IAM token project mismatch");
  }

  const workspaceBaseUrl = workspaceBaseUrlForOrganizationOrigin(preparedLogin.organizationOrigin);
  const [serverSettings, profile] = await Promise.all([
    fetchWorkspaceServerSettingsForOrganization(preparedLogin.organizationUrl, {
      fetchImpl,
      signal,
    }),
    loadWorkspaceProfileOrFallback({
      accessToken: token.accessToken,
      baseUrl: workspaceBaseUrl,
      fetchImpl,
      signal,
      userUuid,
      login: preparedLogin.login,
    }),
  ]);
  const organizationId = buildOrgRouteIdFromOrigin(preparedLogin.organizationOrigin);
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
    organizationOrigin: preparedLogin.organizationOrigin,
    projectId: trimmedProjectId,
    userUuid,
    login: preparedLogin.login,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? preparedLogin.refreshToken,
    expiresAtMs: expiresAtMsFromToken(token.expiresIn, claims?.expiresAtSeconds),
    profile,
    runtimeGeneration: existing?.runtimeGeneration ?? 0,
  };

  resetTerminalRefreshFailureAttempts(accountId);
  useWorkspaceAuthStore.getState().setSession(session);
  return {
    session: useWorkspaceAuthStore.getState().getCurrentSession() ?? session,
    serverSettings,
  };
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
  const workspaceBaseUrl = workspaceBaseUrlForOrganizationOrigin(safeOrigin);
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
    baseUrl: workspaceBaseUrl,
    fetchImpl,
    signal,
    userUuid,
    login,
  });

  const organizationId = buildOrgRouteIdFromOrigin(safeOrigin);
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

  resetTerminalRefreshFailureAttempts(accountId);
  useWorkspaceAuthStore.getState().setSession(session);
  return {
    session: useWorkspaceAuthStore.getState().getCurrentSession() ?? session,
    serverSettings,
  };
}

export async function removeWorkspaceSession(accountId: string): Promise<void> {
  await removeWorkspaceSessionAfterCacheCleanup(accountId, undefined, "explicit-logout");
}
