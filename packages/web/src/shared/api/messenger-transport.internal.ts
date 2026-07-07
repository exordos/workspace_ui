import {
  X_WORKSPACE_DEV_TARGET_ORIGIN,
  isDevWorkspaceMessengerApiPathname,
  isAllowedDevWorkspaceProxyTargetOrigin,
} from "~/shared/config/dev-workspace-org-proxy";
import { buildMessengerBearerAuthHeader } from "./messenger-auth";

// Нижний HTTP-слой для Workspace Messenger API.
// Всё, что выше, должно работать уже с DTO или доменными объектами, а не собирать URL руками.
export const DEFAULT_MESSENGER_API_BASE = "/api/messenger/v1";

export type MessengerHttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type MessengerDtoGuard<T> = (value: unknown) => value is T;
export type MessengerQueryParamValue = string | number;
export type MessengerQueryParams = Record<
  string,
  | MessengerQueryParamValue
  | readonly (MessengerQueryParamValue | null | undefined)[]
  | null
  | undefined
>;

export interface MessengerClientOptions {
  accessToken: string | null | undefined;
  baseUrl?: string;
  devTargetOrigin?: string;
  projectId?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

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

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "MessengerApiError";
    this.status = status;
    this.data = data;
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

// Workspace API использует одинаковые имена курсора на списковых эндпоинтах.
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

// Публичные эндпоинты, например server_settings, не должны получать bearer auth.
function buildHeaders(
  accessToken: string | null | undefined,
  body: unknown,
  isPublic: boolean,
  devTargetOrigin: string | undefined,
  shouldAppendDevTargetOrigin: boolean,
  accept = "application/json",
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
  };
}

function shouldAppendDevProxyTargetHeader(url: string): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      isDevWorkspaceMessengerApiPathname(parsed.pathname)
    );
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
): Promise<MessengerJsonResult> {
  // Здесь собирается реальный HTTP-запрос к Workspace API: auth, dev proxy header, body и abort signal.
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method,
    headers: buildHeaders(
      options.accessToken,
      body,
      false,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
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
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new MessengerApiError(
      `Messenger API ${method} ${responsePath} failed`,
      response.status,
      data,
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
      options.accessToken,
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
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new MessengerApiError(`Messenger API POST ${responsePath} failed`, response.status, data);
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
  // Workspace files/download возвращает не JSON, а bytes. Этот helper сохраняет
  // общий auth/dev-proxy слой, но не пытается пропустить attachment через JSON parser.
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildMessengerUrl(options.baseUrl, path, params);
  const init: RequestInit = {
    method: "GET",
    headers: buildHeaders(
      options.accessToken,
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
    const data = await parseJsonResponse(response);
    throw new MessengerApiError(`Messenger API GET ${responsePath} failed`, response.status, data);
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
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new MessengerApiError(`Messenger API GET ${responsePath} failed`, response.status, data);
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
): Promise<unknown> {
  const { data } = await sendJsonResult("PUT", path, options, params, body);
  return data;
}

export async function messengerDeleteJson(
  path: string,
  options: MessengerClientOptions,
  params: MessengerQueryParams = {},
): Promise<unknown> {
  const { data } = await sendJsonResult("DELETE", path, options, params);
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
  // Списковые ответы можно мягко фильтровать, чтобы один битый элемент не ронял весь sidebar.
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
  // Strict-режим используем там, где пропуск элемента опаснее явной ошибки контракта.
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
