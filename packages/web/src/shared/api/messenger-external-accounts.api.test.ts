import { describe, expect, it, vi } from "vitest";
import {
  createExternalAccount,
  getExternalAccounts,
  getExternalAccountsPage,
} from "./messenger-external-accounts.api";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_UUID = "33333333-3333-4333-8333-333333333333";
const DATE = "2026-07-10T09:30:00Z";

const accountDto = {
  uuid: ACCOUNT_UUID,
  project_id: PROJECT_UUID,
  user_uuid: USER_UUID,
  server_url: "https://zulip.example.com",
  source_scope: "https://zulip.example.com",
  account_type: "zulip",
  status: "new",
  access_status: "confirmed",
  access_checked_at: DATE,
  access_confirmed_at: DATE,
  access_next_check_at: DATE,
  access_last_error: null,
  account_settings: {
    kind: "zulip",
    credentials: { kind: "zulip", login: "user@example.com", token: "secret" },
  },
  created_at: DATE,
  updated_at: DATE,
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) throw new Error("Expected fetch to be called");
  return call;
}

describe("messenger external accounts API", () => {
  it("gets the owner-scoped list and supports pagination headers", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(jsonResponse([accountDto]));

    await expect(
      getExternalAccounts(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        { pageLimit: 20, pageMarker: "account-page" },
      ),
    ).resolves.toEqual([accountDto]);

    expect(firstFetchCall(fetchMock)[0]).toBe(
      "/api/workspace/v1/messenger/external_accounts/?page_limit=20&page_marker=account-page",
    );

    const pageFetchMock = vi.fn<typeof fetch>();
    pageFetchMock.mockResolvedValue(
      jsonResponse([accountDto], 200, {
        "X-Pagination-Marker": "next-account",
        "X-Pagination-Limit": "20",
      }),
    );
    await expect(
      getExternalAccountsPage(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: pageFetchMock,
        },
        { pageLimit: 20 },
      ),
    ).resolves.toEqual({
      items: [accountDto],
      nextPageMarker: "next-account",
      pageLimit: 20,
    });
  });

  it("posts only the backend create contract", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(jsonResponse(accountDto, 201));
    const body = {
      server_url: "https://zulip.example.com",
      account_settings: {
        kind: "zulip" as const,
        credentials: { kind: "zulip" as const, login: "user@example.com", token: "secret" },
      },
    };

    await expect(
      createExternalAccount(
        {
          accessToken: "access-token",
          baseUrl: "/api/workspace/v1/messenger",
          fetchImpl: fetchMock,
        },
        body,
      ),
    ).resolves.toEqual(accountDto);

    const [url, init] = firstFetchCall(fetchMock);
    const serializedBody = typeof init?.body === "string" ? init.body : "";
    expect(url).toBe("/api/workspace/v1/messenger/external_accounts/");
    expect(init?.method).toBe("POST");
    expect(serializedBody).toBe(JSON.stringify(body));
    expect(JSON.parse(serializedBody)).not.toHaveProperty("project_id");
    expect(JSON.parse(serializedBody)).not.toHaveProperty("user_uuid");
  });
});
