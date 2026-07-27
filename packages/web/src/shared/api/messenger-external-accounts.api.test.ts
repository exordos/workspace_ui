import { describe, expect, it, vi } from "vitest";
import {
  createExternalAccount,
  deleteExternalAccount,
  disconnectExternalAccount,
  getExternalAccount,
  getExternalAccountsPage,
  reconnectExternalAccount,
  updateExternalAccount,
} from "./messenger-external-accounts.api";

const accountDto = {
  uuid: "33333333-3333-4333-8333-333333333333",
  settings: {
    kind: "zulip",
    server_url: "https://zulip.example.com",
    email: "user@example.com",
    selection_mode: "explicit",
    history_depth: "30_days",
    default_project_id: "22222222-2222-4222-8222-222222222222",
  },
  credential_present: true,
  status: "live",
  live_ready: true,
  capabilities: {},
  safe_error: null,
  desired_generation: 2,
  applied_generation: 2,
  last_progress_at: null,
  revision: 3,
  created_at: "2026-07-10T08:00:00Z",
  updated_at: "2026-07-10T09:00:00Z",
} as const;

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function options(fetchImpl: typeof fetch) {
  return { accessToken: "test", baseUrl: "/api/workspace/v1/messenger", fetchImpl };
}

function firstCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) throw new Error("Expected fetch call");
  return call;
}

describe("messenger external accounts API", () => {
  it("loads the paginated sanitized contract", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([accountDto], 200, {
        "X-Pagination-Marker": "next",
        "X-Pagination-Limit": "20",
      }),
    );
    await expect(getExternalAccountsPage(options(fetchMock), { pageLimit: 20 })).resolves.toEqual({
      items: [accountDto],
      nextPageMarker: "next",
      pageLimit: 20,
    });
  });

  it("returns strong ETags for get and create", async () => {
    const getMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(accountDto, 200));
    await expect(getExternalAccount(options(getMock), accountDto.uuid)).resolves.toMatchObject({
      account: accountDto,
      etag: '"3"',
    });

    const createMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(accountDto, 201, { ETag: '"server-etag"' }));
    const body = {
      uuid: accountDto.uuid,
      settings: { ...accountDto.settings, api_key: "secret" },
    };
    await expect(createExternalAccount(options(createMock), body)).resolves.toMatchObject({
      etag: '"server-etag"',
    });
    expect(firstCall(createMock)[1]?.body).toBe(JSON.stringify(body));
  });

  it("sends If-Match for update and reconnect", async () => {
    const updateMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(accountDto));
    await updateExternalAccount(
      options(updateMock),
      accountDto.uuid,
      {
        settings: {
          kind: "zulip",
          selection_mode: "explicit",
          history_depth: "90_days",
          default_project_id: accountDto.settings.default_project_id,
        },
      },
      '"3"',
    );
    expect(new Headers(firstCall(updateMock)[1]?.headers).get("If-Match")).toBe('"3"');

    const reconnectMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(accountDto));
    await reconnectExternalAccount(
      options(reconnectMock),
      accountDto.uuid,
      {
        settings: {
          kind: "zulip",
          server_url: accountDto.settings.server_url,
          email: accountDto.settings.email,
          api_key: "changed",
        },
      },
      '"3"',
    );
    expect(new Headers(firstCall(reconnectMock)[1]?.headers).get("If-Match")).toBe('"3"');
  });

  it("supports disconnect and destructive delete without a precondition", async () => {
    const disconnectMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(accountDto));
    await disconnectExternalAccount(options(disconnectMock), accountDto.uuid);
    expect(firstCall(disconnectMock)[0]).toContain("/actions/disconnect/invoke");

    const deleteMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(null, 204));
    await deleteExternalAccount(options(deleteMock), accountDto.uuid);
    expect(firstCall(deleteMock)[1]?.method).toBe("DELETE");
  });
});
