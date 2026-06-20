/**
 * Shared mocks and helpers for Messenger API client tests (`messenger-*.test.ts`).
 *
 * Import this module first in each test file so `vi.mock` runs before the module under test loads.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { clearAllMessengerEventQueueIds } from "~/shared/lib/messenger-event-queue-registry.lib";

const mockGetCurrentInstance = vi.hoisted(() => vi.fn());

const mockMessengerApi = vi.hoisted(() => ({
  get: vi.fn(),
  getWithBase: vi.fn(),
  post: vi.fn(),
  postFormData: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

const mockRefreshMessengerApiBase = vi.hoisted(() => vi.fn());
const mockRefreshWorkspaceApiBase = vi.hoisted(() => vi.fn());

export function getMockGetCurrentInstance() {
  return mockGetCurrentInstance;
}

export function getMockMessengerApi() {
  return mockMessengerApi;
}

export function getMockRefreshMessengerApiBase() {
  return mockRefreshMessengerApiBase;
}

vi.mock("./client", () => ({
  getCurrentInstance: mockGetCurrentInstance,
  getMessengerGatewayApiBaseForCurrentInstance: () => "/api/messanger/v1",
  messengerApi: mockMessengerApi,
  refreshMessengerApiBase: mockRefreshMessengerApiBase,
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
  env: { MESSENGER_API_V1_PATH: "/api/v1" },
}));

vi.mock("~/shared/lib/logger", async (importOriginal) => {
  const { createPartialLoggerMock } = await import("~/test/logger-vitest-mock");
  return createPartialLoggerMock(
    importOriginal as () => Promise<typeof import("~/shared/lib/logger")>,
  );
});

export const TEST_INSTANCE = {
  id: "test-inst",
  realm: "https://chat.example.com",
  login: "user@example.com",
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
  clearAllMessengerEventQueueIds();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  mockGetCurrentInstance.mockReset();
  mockGetCurrentInstance.mockReturnValue(TEST_INSTANCE);
  mockMessengerApi.get.mockReset();
  mockMessengerApi.getWithBase.mockReset();
  mockMessengerApi.post.mockReset();
  mockMessengerApi.postFormData.mockReset();
  mockMessengerApi.patch.mockReset();
  mockMessengerApi.delete.mockReset();
  mockRefreshMessengerApiBase.mockReset();
  mockRefreshWorkspaceApiBase.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});
