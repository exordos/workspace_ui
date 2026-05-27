/**
 * Shared mocks and helpers for Zulip API client tests (`zulip-*.test.ts`).
 *
 * Import this module first in each test file so `vi.mock` runs before `./zulip` loads.
 */
import { afterEach, beforeEach, vi } from "vitest";

const mockZulipClient = vi.hoisted(() => ({
  streams: {
    retrieve: vi.fn(),
    topics: { retrieve: vi.fn() },
  },
  messages: {
    retrieve: vi.fn(),
    send: vi.fn(),
  },
}));

export function getMockZulipClient() {
  return mockZulipClient;
}

const mockGetCurrentInstance = vi.hoisted(() => vi.fn());

const mockZulipApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postFormData: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

const mockRefreshZulipApiBase = vi.hoisted(() => vi.fn());
const mockRefreshWorkspaceApiBase = vi.hoisted(() => vi.fn());

export function getMockGetCurrentInstance() {
  return mockGetCurrentInstance;
}

export function getMockZulipApi() {
  return mockZulipApi;
}

export function getMockRefreshZulipApiBase() {
  return mockRefreshZulipApiBase;
}

export function getMockRefreshWorkspaceApiBase() {
  return mockRefreshWorkspaceApiBase;
}

vi.mock("./client", () => ({
  getCurrentInstance: mockGetCurrentInstance,
  zulipApi: mockZulipApi,
  refreshZulipApiBase: mockRefreshZulipApiBase,
  refreshWorkspaceApiBase: mockRefreshWorkspaceApiBase,
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  getBasicAuthValue: () => "Basic dGVzdEB0LmNvbTprZXkxMjM=",
  buildAuthHeader: () => ({ Authorization: "Basic dGVzdEB0LmNvbTprZXkxMjM=" }),
  setAuthInstanceGetter: vi.fn(),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("~/shared/lib/env", () => ({
  env: { ZULIP_API_PATH: "/api/v1" },
}));

vi.mock("~/shared/lib/logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(
    importOriginal as () => Promise<typeof import("~/shared/lib/logger")>,
  );
});

vi.mock("zulip-js", () => ({
  default: vi.fn(() => Promise.resolve(mockZulipClient)),
}));

export const TEST_INSTANCE = {
  id: "test-inst",
  realm: "https://zulip.example.com",
  email: "user@example.com",
  apiKey: "test",
};

export const mockFetch = vi.fn();

export function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  mockGetCurrentInstance.mockReset();
  mockGetCurrentInstance.mockReturnValue(TEST_INSTANCE);
  mockZulipClient.streams.retrieve.mockReset();
  mockZulipClient.streams.topics.retrieve.mockReset();
  mockZulipClient.messages.retrieve.mockReset();
  mockZulipClient.messages.send.mockReset();
  mockZulipApi.get.mockReset();
  mockZulipApi.post.mockReset();
  mockZulipApi.postFormData.mockReset();
  mockZulipApi.patch.mockReset();
  mockZulipApi.delete.mockReset();
  mockRefreshZulipApiBase.mockReset();
  mockRefreshWorkspaceApiBase.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});
