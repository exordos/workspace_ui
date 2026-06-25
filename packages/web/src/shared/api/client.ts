/**
 * HTTP client with a middleware pipeline (auth, logging, retry, timeouts).
 *
 * Usage:
 *   import { messengerApi, workspaceApi } from "~/shared/api/client";
 *   const res = await messengerApi.get("/messages", { anchor: "newest" });
 *   messengerApi.use(myMiddleware);
 */

import { MESSENGER_API_FETCH_TIMEOUT_MS } from "~/shared/config/constants";
import {
  DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX,
  X_WORKSPACE_DEV_TARGET_ORIGIN,
  devWorkspaceBrowserMountPath,
  isAllowedDevWorkspaceProxyTargetOrigin,
  workspaceRestApiPathSuffix,
} from "~/shared/config/dev-workspace-org-proxy";
import {
  MESSENGER_API_PATH,
  MESSENGER_WORKSPACE_API_PATH,
} from "~/shared/config/workspace-api-layout";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import {
  noteApiTransportFailure,
  noteApiTransportSuccess,
  reportFailure,
} from "~/shared/lib/connection-health";
import { env } from "~/shared/lib/env";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { logApiCall } from "~/shared/lib/logger";
import { extractLoggableRequestParams } from "~/shared/lib/logger-request-params.lib";
import {
  ingestMessengerRateLimitFromApiResponse,
  waitUntilMessengerRateLimitReleased,
} from "~/shared/lib/messenger-rate-limit-gate";
import { workspaceOrgApiOriginFromRealmRoot } from "~/shared/lib/workspace-org-origin.lib";
import { refreshStoredIamAccessToken } from "./iam-refresh-session.lib";

// ---
// Instance credentials provider (injected from `app` to avoid shared → entities import)
// ---

export interface InstanceCredentials {
  id: string;
  realm: string;
  login: string;
  authType: "iam";
  iamAccessToken?: string;
  iamRefreshToken?: string;
  /** Workspace REST origin for this org (from the server URL entered at login). */
  workspaceOrgOrigin?: string;
}

let instanceProvider: (() => InstanceCredentials | null) | null = null;

/** Injected from `app` to supply active instance credentials. */
export function setInstanceProvider(fn: () => InstanceCredentials | null): void {
  instanceProvider = fn;
}

export function getCurrentInstance(): InstanceCredentials | null {
  return instanceProvider?.() ?? null;
}

function normalizeInstanceRealmRoot(realmInput: string): string {
  return realmInput
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/messenger\/v1$/i, "")
    .replace(/\/+$/, "");
}

function workspaceOrgApiOriginForWorkspaceRest(instance: InstanceCredentials): string {
  const stored = instance.workspaceOrgOrigin?.trim() ?? "";
  if (stored !== "" && isAllowedDevWorkspaceProxyTargetOrigin(stored)) {
    return new URL(stored).origin;
  }
  return workspaceOrgApiOriginFromRealmRoot(normalizeInstanceRealmRoot(instance.realm));
}

/** DEV: organization realm origin that serves `/user_uploads`, not the Workspace gateway. */
function realmOriginForDevUserUploads(instance: InstanceCredentials): string {
  const root = normalizeInstanceRealmRoot(instance.realm);
  if (root === "") {
    return "";
  }
  try {
    return new URL(/^https?:\/\//i.test(root) ? root : `https://${root}`).origin;
  } catch {
    return "";
  }
}

/** DEV: realm origin for Vite `/user_uploads` proxy via `X-Workspace-Dev-Target-Origin`. */
export function getDevUserUploadsProxyTargetOrigin(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  const realmOrigin = realmOriginForDevUserUploads(instance);
  if (realmOrigin === "") {
    return null;
  }
  if (!isAllowedDevWorkspaceProxyTargetOrigin(realmOrigin)) {
    return null;
  }
  return realmOrigin;
}

function isRealmMessageMediaProxyPath(pathOnly: string): boolean {
  return (
    pathOnly === "/user_uploads" ||
    pathOnly.startsWith("/user_uploads/") ||
    pathOnly === "/external_content" ||
    pathOnly.startsWith("/external_content/") ||
    pathOnly === "/avatar" ||
    pathOnly.startsWith("/avatar/") ||
    pathOnly === "/user_avatars" ||
    pathOnly.startsWith("/user_avatars/")
  );
}

/** DEV: adds `X-Workspace-Dev-Target-Origin` so Vite proxies realm media paths. */
export function appendDevRealmMediaProxyHeaders(
  candidateUrl: string,
  headers: Record<string, string>,
): Record<string, string> {
  if (!import.meta.env.DEV || typeof document === "undefined") {
    return headers;
  }
  const target = getDevUserUploadsProxyTargetOrigin();
  if (target == null) {
    return headers;
  }
  try {
    const parsed = new URL(candidateUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return headers;
    }
    const pathOnly = parsed.pathname;
    if (!isRealmMessageMediaProxyPath(pathOnly)) {
      return headers;
    }
    if (headers[X_WORKSPACE_DEV_TARGET_ORIGIN]) {
      return headers;
    }
    return { ...headers, [X_WORKSPACE_DEV_TARGET_ORIGIN]: target };
  } catch {
    return headers;
  }
}

export function appendDevUserUploadsProxyHeaders(
  candidateUrl: string,
  headers: Record<string, string>,
): Record<string, string> {
  return appendDevRealmMediaProxyHeaders(candidateUrl, headers);
}

// ---
// Types
// ---

export interface ApiRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: BodyInit;
  params?: Record<string, string>;
  signal?: AbortSignal;
  cache?: RequestCache;
  meta: Record<string, unknown>;
}

export interface ApiResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  data: unknown;
  raw: Response;
  durationMs: number;
}

export type NextFn = (req: ApiRequest) => Promise<ApiResponse>;

export type Middleware = (req: ApiRequest, next: NextFn) => Promise<ApiResponse>;

type AuthErrorHandler = () => void;
const AUTH_401_COOLDOWN_MS = 1000;
let authErrorHandler: AuthErrorHandler | null = null;
let lastHandledAuth401At = 0;

export function setAuthErrorHandler(handler: AuthErrorHandler | null): void {
  authErrorHandler = handler;
}

// ---
// Built-in middleware
// ---

const noCacheMiddleware: Middleware = async (req, next) => {
  req.cache = "no-store";
  return next(req);
};

const authMiddleware: Middleware = async (req, next) => {
  const instance = getCurrentInstance();
  if (instance != null) {
    const accessToken = resolveIamAccessToken(instance);
    if (accessToken.length > 0) {
      req.headers.Authorization = `Bearer ${accessToken}`;
    }
  }
  return next(req);
};

function pathnameUnderWorkspaceDevPrefix(pathname: string, prefix: string): boolean {
  const p = prefix.replace(/\/+$/, "");
  return pathname === p || pathname.startsWith(`${p}/`);
}

function workspaceDevHeaderTargetPathPrefixes(): readonly string[] {
  const mount = devWorkspaceBrowserMountPath(env.WORKSPACE_REST_API_PATH).replace(/\/+$/, "");
  const escaped = `${DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX}${mount}`.replace(/\/+$/, "");
  return /^https?:\/\//i.test(env.WORKSPACE_API_BASE) ? [escaped] : [mount];
}

function messengerDevHeaderTargetPathPrefixes(): readonly string[] {
  return Array.from(
    new Set(
      [MESSENGER_API_PATH, MESSENGER_WORKSPACE_API_PATH].map((path) => path.replace(/\/+$/, "")),
    ),
  );
}

function shouldAttachDevOrgTargetHeader(pathname: string): boolean {
  const workspacePrefixes = workspaceDevHeaderTargetPathPrefixes();
  if (workspacePrefixes.some((p) => pathnameUnderWorkspaceDevPrefix(pathname, p))) {
    return true;
  }

  const messengerPrefixes = messengerDevHeaderTargetPathPrefixes();
  return messengerPrefixes.some((p) => pathnameUnderWorkspaceDevPrefix(pathname, p));
}

/** DEV: tells Vite dev proxy which org host should receive Workspace and Messenger REST. */
const devWorkspaceOrgTargetHeaderMiddleware: Middleware = async (req, next) => {
  if (!import.meta.env.DEV) {
    return next(req);
  }
  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return next(req);
  }
  if (!shouldAttachDevOrgTargetHeader(pathname)) {
    return next(req);
  }
  const instance = getCurrentInstance();
  if (instance == null) {
    return next(req);
  }
  const orgOrigin = workspaceOrgApiOriginForWorkspaceRest(instance);
  if (orgOrigin === "") {
    return next(req);
  }
  req.headers[X_WORKSPACE_DEV_TARGET_ORIGIN] = orgOrigin;
  return next(req);
};

const loggingMiddleware: Middleware = async (req, next) => {
  const start = performance.now();
  const params = extractLoggableRequestParams(req);
  const logPath = (() => {
    try {
      const parsed = new URL(req.url);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return req.url;
    }
  })();
  try {
    const res = await next(req);
    res.durationMs = Math.round(performance.now() - start);
    logApiCall(req.method, logPath, {
      status: res.status,
      durationMs: res.durationMs,
      ...(params ? { params } : {}),
    });
    return res;
  } catch (err) {
    if (isAbortError(err) || req.signal?.aborted === true) {
      throw err;
    }
    const durationMs = Math.round(performance.now() - start);
    logApiCall(req.method, logPath, {
      durationMs,
      error: err instanceof Error ? err.message : "Unknown error",
      ...(params ? { params } : {}),
    });
    throw err;
  }
};

function resolveRetryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  const fallbackDelayMs = 1000 * (attempt + 1);
  if (!retryAfterHeader) {
    return fallbackDelayMs;
  }

  const trimmed = retryAfterHeader.trim();
  if (!/^\d+$/.test(trimmed)) {
    return fallbackDelayMs;
  }

  const parsedSeconds = Number(trimmed);
  if (!Number.isSafeInteger(parsedSeconds) || parsedSeconds < 0) {
    return fallbackDelayMs;
  }

  return Math.min(parsedSeconds * 1000, 10000);
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

const connectionHealthMiddleware: Middleware = async (req, next) => {
  try {
    const res = await next(req);
    if (res.ok) {
      noteApiTransportSuccess();
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      reportFailure({ reason: "server", phase: "degraded" });
    }
    return res;
  } catch (err) {
    if (!isAbortError(err)) {
      noteApiTransportFailure(err);
    }
    throw err;
  }
};

const retryMiddleware: Middleware = async (req, next) => {
  const MAX_RETRIES = 2;
  const RETRY_STATUSES = new Set([429, 502, 503, 504]);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await next(req);
      if (res.ok || !RETRY_STATUSES.has(res.status)) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt < MAX_RETRIES) {
        const delay = resolveRetryDelayMs(res.headers.get("Retry-After"), attempt);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.min(delay, 10000));
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      lastError = err;
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000 * (attempt + 1));
      });
    }
  }
  throw lastError;
};

const messengerRateLimitGateMiddleware: Middleware = async (req, next) => {
  await waitUntilMessengerRateLimitReleased(req.signal);
  const res = await next(req);
  ingestMessengerRateLimitFromApiResponse(res.status, res.data, res.headers);
  return res;
};

function shouldSkipAuthRefresh(req: ApiRequest): boolean {
  try {
    const parsed = new URL(req.url);
    const path = parsed.pathname;
    if (
      /\/server_settings\/?$/.test(path) ||
      /\/accounts\/login\/?$/.test(path) ||
      /\/actions\/get_token\/invoke\/?$/.test(path)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function shouldSkipAuth401Logout(req: ApiRequest): boolean {
  try {
    const parsed = new URL(req.url);
    const path = parsed.pathname;
    if (shouldSkipAuthRefresh(req)) {
      return true;
    }
    // Workspace REST 401 often means gateway policy or disabled feature, not bad Workspace creds.
    if (/\/v1\/(?:folders|services)(?:\/|$)/.test(path)) {
      return true;
    }
    // Workspace messenger gateway APIs use IAM Bearer; refresh is allowed, logout is not.
    if (
      /\/api\/messenger(?:\/v1)?\/(?:folders|streams|stream_bindings|stream_topics|messages|events|epoch)(?:\/|$)/.test(
        path,
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Links caller `signal` with a timeout; whichever fires first wins. */
function createLinkedAbortSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => {
    controller.abort();
  };
  if (outer) {
    if (outer.aborted) {
      controller.abort();
    } else {
      outer.addEventListener("abort", onOuterAbort);
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(id);
      outer?.removeEventListener("abort", onOuterAbort);
    },
  };
}

/** Applies `MESSENGER_API_FETCH_TIMEOUT_MS` per retry attempt (runs after retry middleware). */
const messengerRequestTimeoutMiddleware: Middleware = async (req, next) => {
  const { signal, cleanup } = createLinkedAbortSignal(req.signal, MESSENGER_API_FETCH_TIMEOUT_MS);
  try {
    return await next({ ...req, signal });
  } finally {
    cleanup();
  }
};

const authErrorMiddleware: Middleware = async (req, next) => {
  const res = await next(req);
  if (res.status !== 401) {
    return res;
  }
  const instance = getCurrentInstance();
  if (instance == null) {
    return res;
  }

  const alreadyRetried = req.meta.iamAuthRetried === true;
  if (!alreadyRetried && !shouldSkipAuthRefresh(req)) {
    const refreshToken = instance.iamRefreshToken?.trim() ?? "";
    if (refreshToken.length > 0) {
      const refreshed = await refreshStoredIamAccessToken({
        iamOrigin: resolveIamApiOrigin(instance),
        refreshToken,
        instanceId: instance.id,
      });
      if (refreshed != null) {
        return next({
          ...req,
          meta: { ...req.meta, iamAuthRetried: true },
          headers: {
            ...req.headers,
            Authorization: `Bearer ${refreshed.accessToken}`,
          },
        });
      }
    }
  }

  if (shouldSkipAuth401Logout(req)) {
    return res;
  }

  const now = Date.now();
  if (now - lastHandledAuth401At < AUTH_401_COOLDOWN_MS) {
    return res;
  }
  lastHandledAuth401At = now;
  wipeCredentials();
  authErrorHandler?.();

  return res;
};

// ---
// URL resolution
// ---

function buildResolvedApiUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\//, "");
  const isAbsoluteBase = /^https?:\/\//i.test(base);
  const normalizedRelativeBase = base.startsWith("/") ? base : `/${base}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const resolvedBase = isAbsoluteBase ? base : `${origin}${normalizedRelativeBase}`;
  const url = new URL(`${resolvedBase}/${cleanPath}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

// ---
// Client
// ---

class ApiClient {
  private middlewares: Middleware[] = [];
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.middlewares = [
      noCacheMiddleware,
      authMiddleware,
      loggingMiddleware,
      retryMiddleware,
      connectionHealthMiddleware,
      authErrorMiddleware,
    ];
  }

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  useBefore(refMiddleware: Middleware, middleware: Middleware): this {
    const idx = this.middlewares.indexOf(refMiddleware);
    if (idx >= 0) {
      this.middlewares.splice(idx, 0, middleware);
    } else {
      this.middlewares.unshift(middleware);
    }
    return this;
  }

  removeMiddleware(middleware: Middleware): this {
    this.middlewares = this.middlewares.filter((m) => m !== middleware);
    return this;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    return buildResolvedApiUrl(this.baseUrl, path, params);
  }

  private async execute(req: ApiRequest): Promise<ApiResponse> {
    const chain = [...this.middlewares];

    const fetchFn: NextFn = async (r) => {
      const init: RequestInit = {
        method: r.method,
        headers: r.headers,
        signal: r.signal,
        cache: r.cache,
        credentials: "same-origin",
      };
      if (r.body) {
        init.body = r.body;
      }
      const raw = await fetch(r.url, init);
      let data: unknown;
      try {
        data = await raw.clone().json();
      } catch {
        data = null;
      }
      return {
        status: raw.status,
        ok: raw.ok,
        headers: raw.headers,
        data,
        raw,
        durationMs: 0,
      };
    };

    let handler: NextFn = fetchFn;
    for (let i = chain.length - 1; i >= 0; i--) {
      const mw = chain[i]!;
      const nextHandler = handler;
      handler = (r) => mw(r, nextHandler);
    }

    return handler(req);
  }

  async get(
    path: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ApiResponse> {
    return this.execute({
      method: "GET",
      url: this.buildUrl(path, params),
      headers: {},
      signal,
      meta: {},
    });
  }

  /** `GET` with explicit base URL (safer under concurrency than mutating `setBaseUrl`). */
  async getWithBase(
    baseUrl: string,
    path: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ApiResponse> {
    return this.execute({
      method: "GET",
      url: buildResolvedApiUrl(baseUrl, path, params),
      headers: {},
      signal,
      meta: {},
    });
  }

  async deleteWithBase(
    baseUrl: string,
    path: string,
    body?: Record<string, string>,
  ): Promise<ApiResponse> {
    const hasBody = body && Object.keys(body).length > 0;
    return this.execute({
      method: "DELETE",
      url: buildResolvedApiUrl(baseUrl, path),
      headers: hasBody ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
      body: hasBody ? new URLSearchParams(body).toString() : undefined,
      meta: {},
    });
  }

  async postWithBase(
    baseUrl: string,
    path: string,
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ApiResponse> {
    return this.execute({
      method: "POST",
      url: buildResolvedApiUrl(baseUrl, path),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal,
      meta: {},
    });
  }

  async postJsonWithBase<T = unknown>(
    baseUrl: string,
    path: string,
    body: unknown,
  ): Promise<ApiResponse & { data: T }> {
    const res = await this.execute({
      method: "POST",
      url: buildResolvedApiUrl(baseUrl, path),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      meta: {},
    });
    return res as ApiResponse & { data: T };
  }

  async putJsonWithBase<T = unknown>(
    baseUrl: string,
    path: string,
    body: unknown,
  ): Promise<ApiResponse & { data: T }> {
    const res = await this.execute({
      method: "PUT",
      url: buildResolvedApiUrl(baseUrl, path),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      meta: {},
    });
    return res as ApiResponse & { data: T };
  }

  async post(
    path: string,
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ApiResponse> {
    return this.execute({
      method: "POST",
      url: this.buildUrl(path),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal,
      meta: {},
    });
  }

  async patch(path: string, body: Record<string, string>): Promise<ApiResponse> {
    return this.execute({
      method: "PATCH",
      url: this.buildUrl(path),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      meta: {},
    });
  }

  async delete(path: string, body?: Record<string, string>): Promise<ApiResponse> {
    const hasBody = body && Object.keys(body).length > 0;
    return this.execute({
      method: "DELETE",
      url: this.buildUrl(path),
      headers: hasBody ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
      body: hasBody ? new URLSearchParams(body).toString() : undefined,
      meta: {},
    });
  }

  async postJson<T = unknown>(path: string, body: unknown): Promise<ApiResponse & { data: T }> {
    const res = await this.execute({
      method: "POST",
      url: this.buildUrl(path),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      meta: {},
    });
    return res as ApiResponse & { data: T };
  }

  async putJson<T = unknown>(path: string, body: unknown): Promise<ApiResponse & { data: T }> {
    const res = await this.execute({
      method: "PUT",
      url: this.buildUrl(path),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      meta: {},
    });
    return res as ApiResponse & { data: T };
  }

  async postFormData(path: string, form: FormData, signal?: AbortSignal): Promise<ApiResponse> {
    return this.execute({
      method: "POST",
      url: this.buildUrl(path),
      headers: {},
      body: form,
      signal,
      meta: {},
    });
  }
}

// ---
// Singleton instances
// ---

function workspaceRestPathSuffix(): string {
  return workspaceRestApiPathSuffix(env.WORKSPACE_REST_API_PATH);
}

function devWorkspaceMountPathOnLocalhost(): string {
  return devWorkspaceBrowserMountPath(env.WORKSPACE_REST_API_PATH);
}

/** Same-origin base for multi-org Workspace REST in dev (matches Vite `server.proxy`). */
function getDevWorkspaceProxyBase(): string {
  const base = env.WORKSPACE_API_BASE;
  if (/^https?:\/\//i.test(base)) {
    return `${DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX}${devWorkspaceMountPathOnLocalhost()}`.replace(
      /\/+$/,
      "",
    );
  }
  return base.replace(/\/+$/, "");
}

function getOrgScopedMessengerApiBase(path: string): string {
  const instance = getCurrentInstance();
  if (instance == null || import.meta.env.DEV) {
    return path;
  }
  const orgOrigin = resolveIamApiOrigin(instance).replace(/\/+$/, "");
  if (orgOrigin === "") {
    return path;
  }
  return `${orgOrigin}${path}`;
}

/** Messenger gateway REST base (`/api/messenger/v1`) for the active org. */
export function getMessengerGatewayApiBaseForCurrentInstance(): string {
  return getOrgScopedMessengerApiBase(MESSENGER_API_PATH);
}

/** Native Workspace messenger REST base (`/api/messenger`) for the active org. */
export function getMessengerWorkspaceApiBaseForCurrentInstance(): string {
  return getOrgScopedMessengerApiBase(MESSENGER_WORKSPACE_API_PATH);
}

/** Workspace REST `/v1/...` base for the active org (Workspace API origin, not always organization realm). */
export function getWorkspaceApiBaseForCurrentInstance(): string {
  const instance = getCurrentInstance();

  if (instance == null) {
    return env.WORKSPACE_API_BASE;
  }

  if (import.meta.env.DEV) {
    return getDevWorkspaceProxyBase();
  }

  const orgOrigin = workspaceOrgApiOriginForWorkspaceRest(instance);
  return `${orgOrigin}${workspaceRestPathSuffix()}`;
}

function getMessengerBaseUrl(): string {
  return getMessengerGatewayApiBaseForCurrentInstance();
}

export const messengerApi = new ApiClient("");
messengerApi.useBefore(loggingMiddleware, devWorkspaceOrgTargetHeaderMiddleware);
messengerApi.use(loggingMiddleware);
messengerApi.useBefore(retryMiddleware, messengerRateLimitGateMiddleware);
messengerApi.useBefore(authErrorMiddleware, messengerRequestTimeoutMiddleware);

export const workspaceApi = new ApiClient(env.WORKSPACE_API_BASE);

workspaceApi.useBefore(loggingMiddleware, devWorkspaceOrgTargetHeaderMiddleware);

export function refreshMessengerApiBase(): void {
  messengerApi.setBaseUrl(getMessengerBaseUrl());
}

/** DEV: routes Workspace REST through Vite proxy for the selected instance. */
export function refreshWorkspaceApiBase(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (getCurrentInstance() != null) {
    workspaceApi.setBaseUrl(getDevWorkspaceProxyBase());
  } else {
    workspaceApi.setBaseUrl(env.WORKSPACE_API_BASE);
  }
}

export {
  connectionHealthMiddleware,
  noCacheMiddleware,
  authMiddleware,
  loggingMiddleware,
  retryMiddleware,
  messengerRateLimitGateMiddleware,
  authErrorMiddleware,
  type ApiClient,
};
