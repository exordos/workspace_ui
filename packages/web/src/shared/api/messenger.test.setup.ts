/**
 * Shared mocks and helpers for Messenger API client tests (`messenger-*.test.ts`).
 *
 * Import this module first in each test file so `vi.mock` runs before the module under test loads.
 */
import { afterEach, beforeEach, vi } from "vitest";

const mockGetCurrentInstance = vi.hoisted(() => vi.fn());

const mockMessengerApi = vi.hoisted(() => ({
  get: vi.fn(),
  getWithBase: vi.fn(),
  post: vi.fn(),
  postWithBase: vi.fn(),
  postJsonWithBase: vi.fn(),
  putJsonWithBase: vi.fn(),
  postFormData: vi.fn(),
  postFormDataWithBase: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  deleteWithBase: vi.fn(),
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
  getMessengerGatewayApiBaseForCurrentInstance: () => "/api/workspace/v1/messenger",
  getMessengerWorkspaceApiBaseForCurrentInstance: () => "/api/workspace/v1/messenger",
  getWorkspaceCommonApiBaseForCurrentInstance: () => "/api/workspace/v1",
  messengerApi: mockMessengerApi,
  refreshMessengerApiBase: mockRefreshMessengerApiBase,
  refreshWorkspaceApiBase: mockRefreshWorkspaceApiBase,
}));

vi.mock("~/shared/lib/auth-guard", () => ({
  buildAuthHeader: () => ({ Authorization: "Bearer test-access-token" }),
  setAuthInstanceGetter: vi.fn(),
}));

vi.mock("~/i18n/i18n", () => ({
  t: (key: string) => key,
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
  authType: "iam" as const,
  iamAccessToken: "test-access-token",
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
  mockMessengerApi.get.mockReset();
  mockMessengerApi.getWithBase.mockReset();
  mockMessengerApi.post.mockReset();
  mockMessengerApi.postWithBase.mockReset();
  mockMessengerApi.postJsonWithBase.mockReset();
  mockMessengerApi.putJsonWithBase.mockReset();
  mockMessengerApi.postFormData.mockReset();
  mockMessengerApi.postFormDataWithBase.mockReset();
  mockMessengerApi.patch.mockReset();
  mockMessengerApi.delete.mockReset();
  mockMessengerApi.deleteWithBase.mockReset();
  mockRefreshMessengerApiBase.mockReset();
  mockRefreshWorkspaceApiBase.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});
