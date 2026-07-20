import {
  X_WORKSPACE_DEV_TARGET_ORIGIN,
  isDevWorkspaceApiPathname,
  isAllowedDevWorkspaceProxyTargetOrigin,
} from "~/shared/config/dev-workspace-org-proxy";
import { buildMessengerBearerAuthHeader } from "./messenger-auth";

// Low-level HTTP layer for Workspace APIs.
// Higher layers should work with DTOs or domain objects instead of hand-built URLs.
export const DEFAULT_WORKSPACE_API_BASE = "/api/workspace/v1";
export const DEFAULT_MESSENGER_API_BASE = `${DEFAULT_WORKSPACE_API_BASE}/messenger`;

export type MessengerHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type MessengerDtoGuard<T> = (value: unknown) => value is T;
export interface MessengerAccessTokenRequest {
  force?: boolean;
  signal?: AbortSignal;
}
export type MessengerAccessTokenProvider = (
  request?: MessengerAccessTokenRequest,
) => string | null | undefined | Promise<string | null | undefined>;
export type MessengerQueryParamValue = string | number;
export type MessengerQueryParams = Record<
  string,
  | MessengerQueryParamValue
  | readonly (MessengerQueryParamValue | null | undefined)[]
  | null
  | undefined
>;

export interface WorkspaceApiClientOptions {
  accessToken: string | null | undefined;
  getAccessToken?: MessengerAccessTokenProvider;
  baseUrl?: string;
  devTargetOrigin?: string;
  projectId?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export type MessengerClientOptions = WorkspaceApiClientOptions;

export interface MessengerPublicClientOptions {
  baseUrl?: string;
  devTargetOrigin?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface MessengerPaginationQuery {
  pageLimit?: number;
  pageMarker?: string | number;
}

export interface MessengerCollectionPage<T> {
  items: T[];
  nextPageMarker: string | null;
  pageLimit: number | null;
}

export interface MessengerJsonResult {
  data: unknown;
  headers: Headers;
}

export interface MessengerBinaryResult {
  blob: Blob;
  headers: Headers;
}

export class MessengerApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Headers;

  constructor(message: string, status: number, data: unknown, headers = new Headers()) {
    super(message);
    this.name = "MessengerApiError";
    this.status = status;
    this.data = data;
    this.headers = headers;
  }
}

export function buildMessengerUrl(
  baseUrl: string | undefined,
  path: string,
  params: MessengerQueryParams = {},
): string {
  const base = (baseUrl ?? DEFAULT_MESSENGER_API_BASE).replace(/\/+$/, "");
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          search.append(key, String(item));
        }
      }
    } else if (value != null) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const suffix = query.length > 0 ? `?${query}` : "";
  return `${base}${path}${suffix}`;
}

function pathWithoutTrailingSlash(path: string): string | null {
  if (!path.endsWith("/") || path === "/") {
    return null;
  }
  return path.replace(/\/+$/, "");
}

// Workspace API uses the same cursor names on list endpoints.
export function paginationParams(
  query: MessengerPaginationQuery | undefined,
): MessengerQueryParams {
  return {
    page_limit: query?.pageLimit,
    page_marker: query?.pageMarker,
  };
}

// Empty 204 responses and empty bodies are valid for delete-style endpoints.
async function parseJsonResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

async function parseErrorResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// Public endpoints, for example server_settings, must not receive bearer auth.
function buildHeaders(
  accessToken: string | null | undefined,
  body: unknown,
  isPublic: boolean,
  devTargetOrigin: string | undefined,
  shouldAppendDevTargetOrigin: boolean,
  accept = "application/json",
  requestHeaders?: HeadersInit,
): Record<string, string> {
  const trimmedDevTargetOrigin = devTargetOrigin?.trim() ?? "";
  return {
    Accept: accept,
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(isPublic ? {} : buildMessengerBearerAuthHeader(accessToken)),
    ...(import.meta.env.DEV &&
    shouldAppendDevTargetOrigin &&
    isAllowedDevWorkspaceProxyTargetOrigin(trimmedDevTargetOrigin)
      ? { [X_WORKSPACE_DEV_TARGET_ORIGIN]: new URL(trimmedDevTargetOrigin).origin }
      : {}),
    ...Object.fromEntries(new Headers(requestHeaders).entries()),
  };
}

async function resolveMessengerAccessToken(
  options: MessengerClientOptions,
  force = false,
): Promise<string | null | undefined> {
  return options.getAccessToken?.({ force, signal: options.signal }) ?? options.accessToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function hasAuthTypeMarker(data: unknown): boolean {
  if (!isRecord(data)) {
    return false;
  }
  if (stringValue(data.auth_type) != null || stringValue(data.authType) != null) {
    return true;
  }
  const type = stringValue(data.type);
  const code = stringValue(data.code);
  return type?.includes("auth") === true || code?.includes("auth") === true;
}

function shouldRetryAfterAuthFailure(response: Response, data: unknown): boolean {
  if (response.status === 401) {
    return true;
  }
  return response.status === 403 && hasAuthTypeMarker(data);
}

function shouldAppendDevProxyTargetHeader(url: string): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && isDevWorkspaceApiPathname(parsed.pathname);
  } catch {
    return false;
  }
}

// This is the only helper that performs authenticated network writes.
export async function sendJsonResult(
  method: MessengerHttpMethod,
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
  body?: unknown,
  requestHeaders?: HeadersInit,
): Promise<MessengerJsonResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method,
    headers: buildHeaders(
      await resolveMessengerAccessToken(options),
      body,
      false,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
      "application/json",
      requestHeaders,
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  };
  let response = await fetchImpl(url, init);
  let responsePath = path;
  const fallbackPath = pathWithoutTrailingSlash(path);
  if (response.status === 404 && fallbackPath != null) {
    responsePath = fallbackPath;
    response = await fetchImpl(buildMessengerUrl(options.baseUrl, fallbackPath, params), init);
  }
  let data = response.ok ? await parseJsonResponse(response) : await parseErrorResponse(response);
  if (!response.ok && shouldRetryAfterAuthFailure(response, data)) {
    const retryUrl = buildMessengerUrl(options.baseUrl, responsePath, params);
    response = await fetchImpl(retryUrl, {
      ...init,
      headers: buildHeaders(
        await resolveMessengerAccessToken(options, true),
        body,
        false,
        options.devTargetOrigin,
        shouldAppendDevProxyTargetHeader(retryUrl),
        "application/json",
        requestHeaders,
      ),
    });
    data = response.ok ? await parseJsonResponse(response) : await parseErrorResponse(response);
  }
  if (!response.ok) {
    throw new MessengerApiError(
      `Messenger API ${method} ${responsePath} failed`,
      response.status,
      data,
      response.headers,
    );
  }
  return { data, headers: response.headers };
}

export async function sendFormDataResult(
  path: string,
  options: MessengerClientOptions,
  form: FormData,
  params: MessengerQueryParams = {},
): Promise<MessengerJsonResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method: "POST",
    headers: buildHeaders(
      await resolveMessengerAccessToken(options),
      undefined,
      false,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
    ),
    body: form,
    signal: options.signal,
  };
  let response = await fetchImpl(url, init);
  let responsePath = path;
  const fallbackPath = pathWithoutTrailingSlash(path);
  if (response.status === 404 && fallbackPath != null) {
    responsePath = fallbackPath;
    response = await fetchImpl(buildMessengerUrl(options.baseUrl, fallbackPath, params), init);
  }
  let data = response.ok ? await parseJsonResponse(response) : await parseErrorResponse(response);
  if (!response.ok && shouldRetryAfterAuthFailure(response, data)) {
    const retryUrl = buildMessengerUrl(options.baseUrl, responsePath, params);
    response = await fetchImpl(retryUrl, {
      ...init,
      headers: buildHeaders(
        await resolveMessengerAccessToken(options, true),
        undefined,
        false,
        options.devTargetOrigin,
        shouldAppendDevProxyTargetHeader(retryUrl),
      ),
    });
    data = response.ok ? await parseJsonResponse(response) : await parseErrorResponse(response);
  }
  if (!response.ok) {
    throw new MessengerApiError(
      `Messenger API POST ${responsePath} failed`,
      response.status,
      data,
      response.headers,
    );
  }
  return { data, headers: response.headers };
}

export async function getJsonResult(
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
): Promise<MessengerJsonResult> {
  return sendJsonResult("GET", path, options, params);
}

export async function getBinaryResult(
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
): Promise<MessengerBinaryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method: "GET",
    // File UUIDs identify immutable bytes for the client. Let the browser
    // reuse a cached response before making another authenticated request.
    cache: "force-cache",
    headers: buildHeaders(
      await resolveMessengerAccessToken(options),
      undefined,
      false,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
      "*/*",
    ),
    signal: options.signal,
  };
  let response = await fetchImpl(url, init);
  let responsePath = path;
  const fallbackPath = pathWithoutTrailingSlash(path);
  if (response.status === 404 && fallbackPath != null) {
    responsePath = fallbackPath;
    response = await fetchImpl(buildMessengerUrl(options.baseUrl, fallbackPath, params), init);
  }
  if (!response.ok) {
    let data = await parseErrorResponse(response);
    if (shouldRetryAfterAuthFailure(response, data)) {
      const retryUrl = buildMessengerUrl(options.baseUrl, responsePath, params);
      response = await fetchImpl(retryUrl, {
        ...init,
        headers: buildHeaders(
          await resolveMessengerAccessToken(options, true),
          undefined,
          false,
          options.devTargetOrigin,
          shouldAppendDevProxyTargetHeader(retryUrl),
          "*/*",
        ),
      });
      if (response.ok) {
        return { blob: await response.blob(), headers: response.headers };
      }
      data = await parseErrorResponse(response);
    }
    throw new MessengerApiError(
      `Messenger API GET ${responsePath} failed`,
      response.status,
      data,
      response.headers,
    );
  }
  return { blob: await response.blob(), headers: response.headers };
}

export async function publicGetJsonResult(
  path: string,
  options: MessengerPublicClientOptions,
  params: MessengerQueryParams = {},
): Promise<MessengerJsonResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method: "GET",
    headers: buildHeaders(
      null,
      undefined,
      true,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
    ),
    signal: options.signal,
  };
  let response = await fetchImpl(url, init);
  let responsePath = path;
  const fallbackPath = pathWithoutTrailingSlash(path);
  if (response.status === 404 && fallbackPath != null) {
    responsePath = fallbackPath;
    response = await fetchImpl(buildMessengerUrl(options.baseUrl, fallbackPath, params), init);
  }
  const data = response.ok ? await parseJsonResponse(response) : await parseErrorResponse(response);
  if (!response.ok) {
    throw new MessengerApiError(
      `Messenger API GET ${responsePath} failed`,
      response.status,
      data,
      response.headers,
    );
  }
  return { data, headers: response.headers };
}

export const messengerRequestJsonResult = sendJsonResult;
export const messengerRequestFormDataResult = sendFormDataResult;
export const messengerPublicGetJsonResult = publicGetJsonResult;
export const messengerRequestBinaryResult = getBinaryResult;

export async function messengerGetJson(
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
): Promise<unknown> {
  const { data } = await getJsonResult(path, options, params);
  return data;
}

export async function messengerPostJson(
  path: string,
  options: MessengerClientOptions,
  body?: unknown,
  params: MessengerQueryParams = {},
): Promise<unknown> {
  const { data } = await sendJsonResult("POST", path, options, params, body);
  return data;
}

export async function messengerPutJson(
  path: string,
  options: MessengerClientOptions,
  body?: unknown,
  params: MessengerQueryParams = {},
  requestHeaders?: HeadersInit,
): Promise<unknown> {
  const { data } = await sendJsonResult("PUT", path, options, params, body, requestHeaders);
  return data;
}

export async function messengerDeleteJson(
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
  requestHeaders?: HeadersInit,
): Promise<unknown> {
  const { data } = await sendJsonResult("DELETE", path, options, params, undefined, requestHeaders);
  return data;
}

export async function messengerPublicGetJson(
  path: string,
  options: MessengerPublicClientOptions,
  params: MessengerQueryParams = {},
): Promise<unknown> {
  const { data } = await publicGetJsonResult(path, options, params);
  return data;
}

export function parseDtoList<T>(data: unknown, guard: MessengerDtoGuard<T>, label: string): T[] {
  // List responses can be filtered softly so one broken item does not drop the whole sidebar.
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected ${label} to be an array`);
  }
  return data.filter(guard);
}

// Strict parsing is used where dropping invalid rows would lose backend state.
export function parseStrictDtoList<T>(
  data: unknown,
  guard: MessengerDtoGuard<T>,
  label: string,
): T[] {
  // Strict mode is used when dropping an item is riskier than exposing a contract error.
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected ${label} to be an array`);
  }

  return data.map((item, index) => {
    if (!guard(item)) {
      throw new TypeError(`Expected valid ${label} item at index ${index}`);
    }
    return item;
  });
}

export function parseDto<T>(data: unknown, guard: MessengerDtoGuard<T>, label: string): T {
  if (!guard(data)) {
    throw new TypeError(`Expected valid ${label}`);
  }
  return data;
}

function parsePaginationLimit(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function parsePaginationHeaders(headers: Headers): {
  nextPageMarker: string | null;
  pageLimit: number | null;
} {
  return {
    nextPageMarker: headers.get("X-Pagination-Marker"),
    pageLimit: parsePaginationLimit(headers.get("X-Pagination-Limit")),
  };
}
