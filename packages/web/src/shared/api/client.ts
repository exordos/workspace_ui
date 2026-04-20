/**
 * API client with middleware pipeline.
 *
 * Middleware intercepts requests and responses, enabling:
 * - Auth header injection
 * - Request/response logging with timing
 * - Automatic retry on 429/5xx
 * - Error normalization
 * - Custom interceptors (CSRF, caching, rate limiting)
 *
 * Usage:
 *   import { apiClient } from "~/lib/api/client";
 *
 *   const res = await apiClient.get("/messages", { anchor: "newest" });
 *   const res = await apiClient.post("/messages", { type: "stream", content: "hi" });
 *
 * Custom middleware:
 *   apiClient.use(myMiddleware);
 */

import { ZULIP_API_FETCH_TIMEOUT_MS } from "~/shared/config/constants";
import {
  DEV_WORKSPACE_ORG_PROXY_PATH_PREFIX,
  X_WORKSPACE_DEV_TARGET_ORIGIN,
  devWorkspaceBrowserMountPath,
  isAllowedDevWorkspaceProxyTargetOrigin,
  workspaceRestApiPathSuffix,
} from "~/shared/config/dev-workspace-org-proxy";
import { getBasicAuthValue, wipeCredentials } from "~/shared/lib/auth-guard";
import { env } from "~/shared/lib/env";
import { logApiCall } from "~/shared/lib/logger";
import { workspaceOrgApiOriginFromZulipRealmRoot } from "~/shared/lib/workspace-org-origin.lib";

// ---------------------------------------------------------------------------
// Instance provider (FSD: injected by app layer to avoid shared→entities import)
// ---------------------------------------------------------------------------

export interface InstanceCredentials {
  id: string;
  realm: string;
  email: string;
  apiKey: string;
  authType?: "api_key" | "session";
  /** Origin of Workspace REST for this org (from server URL entered at login). */
  workspaceOrgOrigin?: string;
}

let instanceProvider: (() => InstanceCredentials | null) | null = null;

/** Set by the app layer to provide current instance credentials. */
export function setInstanceProvider(fn: () => InstanceCredentials | null): void {
  instanceProvider = fn;
}

/** Returns the current instance credentials, or null if not logged in. */
export function getCurrentInstance(): InstanceCredentials | null {
  return instanceProvider?.() ?? null;
}

type InstanceAuthType = "api_key" | "session";

function resolveInstanceAuthType(instance: InstanceCredentials | null): InstanceAuthType {
  return instance?.authType === "session" ? "session" : "api_key";
}

function normalizeInstanceRealmRoot(realmInput: string): string {
  const trimmed = realmInput.trim().replace(/\/+$/, "");
  const escapedConfiguredApiPath = env.ZULIP_API_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return trimmed
    .replace(new RegExp(`${escapedConfiguredApiPath}$`), "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/json$/, "")
    .replace(/\/api$/, "")
    .replace(/\/+$/, "");
}

function workspaceOrgApiOriginForWorkspaceRest(instance: InstanceCredentials): string {
  const stored = instance.workspaceOrgOrigin?.trim() ?? "";
  if (stored !== "" && isAllowedDevWorkspaceProxyTargetOrigin(stored)) {
    return new URL(stored).origin;
  }
  return workspaceOrgApiOriginFromZulipRealmRoot(normalizeInstanceRealmRoot(instance.realm));
}

/**
 * DEV: canonical Zulip realm origin (where `/user_uploads` is served), not the Workspace gateway.
 */
function zulipRealmOriginForDevUserUploads(instance: InstanceCredentials): string {
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

/**
 * DEV: Zulip realm origin for Vite `/user_uploads` proxy (`X-Workspace-Dev-Target-Origin`).
 * Uses the instance realm host, not {@link workspaceOrgApiOriginForWorkspaceRest} (gateway).
 */
export function getDevUserUploadsProxyTargetOrigin(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  const realmOrigin = zulipRealmOriginForDevUserUploads(instance);
  if (realmOrigin === "") {
    return null;
  }
  if (!isAllowedDevWorkspaceProxyTargetOrigin(realmOrigin)) {
    return null;
  }
  return realmOrigin;
}

/**
 * DEV: adds `X-Workspace-Dev-Target-Origin` for same-origin fetches to `/user_uploads` so the Vite
 * middleware forwards to the Zulip realm (see `vite-dev-workspace-org-proxy.ts`).
 */
export function appendDevUserUploadsProxyHeaders(
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
    if (pathOnly !== "/user_uploads" && !pathOnly.startsWith("/user_uploads/")) {
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Built-in middleware
// ---------------------------------------------------------------------------

const noCacheMiddleware: Middleware = async (req, next) => {
  req.cache = "no-store";
  return next(req);
};

const authMiddleware: Middleware = async (req, next) => {
  const instance = getCurrentInstance();
  if (resolveInstanceAuthType(instance) === "api_key" && instance?.email && instance?.apiKey) {
    const authValue = getBasicAuthValue({ email: instance.email, apiKey: instance.apiKey });
    if (authValue) {
      req.headers.Authorization = authValue;
    }
  }
  return next(req);
};

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|; )${escapedName}=([^;]*)`);
  const match = document.cookie.match(pattern);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return match[1] ?? null;
  }
}

const sessionCsrfMiddleware: Middleware = async (req, next) => {
  const instance = getCurrentInstance();
  if (resolveInstanceAuthType(instance) !== "session" || req.method === "GET") {
    return next(req);
  }
  const csrfToken =
    readCookieValue("__Host-csrftoken") ?? readCookieValue("csrftoken") ?? readCookieValue("csrf");
  if (csrfToken && csrfToken.length > 0) {
    req.headers["X-CSRFToken"] = csrfToken;
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

/** DEV: tells Vite dev proxy which org host to forward Workspace REST to. */
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
  const prefixes = workspaceDevHeaderTargetPathPrefixes();
  if (!prefixes.some((p) => pathnameUnderWorkspaceDevPrefix(pathname, p))) {
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
  try {
    const res = await next(req);
    res.durationMs = Math.round(performance.now() - start);
    logApiCall(req.method, req.url, {
      status: res.status,
      durationMs: res.durationMs,
    });
    return res;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logApiCall(req.method, req.url, {
      durationMs,
      error: err instanceof Error ? err.message : "Unknown error",
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
        await new Promise<void>((r) => {
          setTimeout(r, Math.min(delay, 10000));
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      lastError = err;
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise<void>((r) => {
        setTimeout(r, 1000 * (attempt + 1));
      });
    }
  }
  throw lastError;
};

function shouldSkipAuth401Handling(req: ApiRequest): boolean {
  try {
    const parsed = new URL(req.url);
    const path = parsed.pathname;
    if (
      /\/fetch_api_key\/?$/.test(path) ||
      /\/server_settings\/?$/.test(path) ||
      /\/accounts\/login\/?$/.test(path)
    ) {
      return true;
    }
    // Workspace folders list: 401 often means Workspace API / gateway policy, not invalid Zulip credentials.
    if (req.method === "GET" && /\/v1\/folders\/?$/.test(path)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Merges an optional caller signal with a wall-clock deadline (whichever fires first). */
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

/** Zulip event-queue long-poll must not use the generic REST timeout (server holds the connection). */
function isZulipEventsLongPollGet(req: ApiRequest): boolean {
  if (req.method !== "GET") {
    return false;
  }
  try {
    return /\/events\/?$/.test(new URL(req.url).pathname);
  } catch {
    return false;
  }
}

/** Enforces {@link ZULIP_API_FETCH_TIMEOUT_MS} per attempt; placed after retry so each retry gets a new deadline. */
const zulipRequestTimeoutMiddleware: Middleware = async (req, next) => {
  if (isZulipEventsLongPollGet(req)) {
    return next(req);
  }
  const { signal, cleanup } = createLinkedAbortSignal(req.signal, ZULIP_API_FETCH_TIMEOUT_MS);
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
  if (shouldSkipAuth401Handling(req)) {
    return res;
  }
  if (getCurrentInstance() == null) {
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

// ---------------------------------------------------------------------------
// URL resolution (shared by default base and per-request base override)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

class ApiClient {
  private middlewares: Middleware[] = [];
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.middlewares = [
      noCacheMiddleware,
      authMiddleware,
      sessionCsrfMiddleware,
      loggingMiddleware,
      retryMiddleware,
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
      const authType = resolveInstanceAuthType(getCurrentInstance());
      const init: RequestInit = {
        method: r.method,
        headers: r.headers,
        signal: r.signal,
        cache: r.cache,
        credentials: authType === "session" ? "include" : "same-origin",
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

  /** GET with an explicit base (avoids mutating {@link setBaseUrl} — safe for concurrent requests). */
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

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

function workspaceRestPathSuffix(): string {
  return workspaceRestApiPathSuffix(env.WORKSPACE_REST_API_PATH);
}

function devWorkspaceMountPathOnLocalhost(): string {
  return devWorkspaceBrowserMountPath(env.WORKSPACE_REST_API_PATH);
}

/** Same-origin base for multi-org Workspace REST in dev (matches Vite `server.proxy` path when relative). */
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

/**
 * Base URL for Workspace REST (`/v1/...`) scoped to the active org (Workspace API origin, not necessarily the Zulip realm host).
 * Used for folder listing so multi-org and gateway setups hit the correct host.
 */
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

function getZulipBaseUrl(): string {
  const instance = getCurrentInstance();
  if (!instance) return "";
  const authType = resolveInstanceAuthType(instance);
  const apiPath = authType === "session" ? "/json" : env.ZULIP_API_PATH;
  const realm = normalizeInstanceRealmRoot(instance.realm);
  return `${realm}${apiPath}`;
}

export const zulipApi = new ApiClient("");
zulipApi.useBefore(authErrorMiddleware, zulipRequestTimeoutMiddleware);

export const workspaceApi = new ApiClient(env.WORKSPACE_API_BASE);

workspaceApi.useBefore(sessionCsrfMiddleware, devWorkspaceOrgTargetHeaderMiddleware);

export function refreshZulipApiBase(): void {
  zulipApi.setBaseUrl(getZulipBaseUrl());
}

/** DEV: point Workspace REST at the org-aware Vite proxy when an instance is selected. */
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
  noCacheMiddleware,
  authMiddleware,
  sessionCsrfMiddleware,
  loggingMiddleware,
  retryMiddleware,
  authErrorMiddleware,
  type ApiClient,
};
