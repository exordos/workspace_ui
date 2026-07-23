import { describe, expect, it, vi } from "vitest";
import {
  changeExternalProviderSuspension,
  createExternalAccount,
  deselectExternalChat,
  getExternalAccounts,
  getExternalAccountsPage,
  getExternalChats,
  getExternalProviderHealth,
  getExternalProviderPolicy,
  selectExternalChat,
  updateExternalAccount,
  updateExternalProviderPolicy,
} from "./messenger-external-accounts.api";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_UUID = "33333333-3333-4333-8333-333333333333";
const CHAT_UUID = "44444444-4444-4444-8444-444444444444";
const POLICY_UUID = "55555555-5555-4555-8555-555555555555";
const DATE = "2026-07-10T09:30:00Z";

const accountDto = {
  uuid: ACCOUNT_UUID,
  settings: {
    kind: "zulip",
    server_url: "https://zulip.example.com",
    email: "user@example.com",
    selection_mode: "explicit",
    history_depth: "30_days",
    default_project_id: PROJECT_UUID,
  },
  credential_present: true,
  status: "connecting",
  live_ready: false,
  capabilities: {},
  safe_error: null,
  desired_generation: 1,
  applied_generation: 0,
  last_progress_at: null,
  revision: 1,
  created_at: DATE,
  updated_at: DATE,
};

const chatDto = {
  uuid: CHAT_UUID,
  external_account_uuid: ACCOUNT_UUID,
  source: { kind: "zulip", chat_type: "channel", original_url: null },
  display_name: "Engineering",
  selected: false,
  project_id: null,
  history_depth: "30_days",
  projection_stream_uuid: null,
  status: "available",
  capabilities: {},
  safe_error: null,
  transition_pending: false,
  revision: 1,
  created_at: DATE,
  updated_at: DATE,
};

const policyDto = {
  uuid: POLICY_UUID,
  provider: "zulip",
  enabled: true,
  emergency_suspended: false,
  limits: {
    max_accounts: 50,
    max_selected_chats_per_account: 500,
    max_file_bytes: 104857600,
  },
  custom_ca_bundle: null,
  revision: 2,
  created_at: DATE,
  updated_at: DATE,
};

const healthDto = {
  provider: "zulip",
  status: "healthy",
  account_counts: { live: 1 },
  chat_counts: { live: 2 },
  bridge_counts: { active: 1 },
  operation_counts: {},
  metrics: { queue_depth: 0 },
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

  it("posts the current provider-neutral create contract", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(jsonResponse(accountDto, 201));
    const body = {
      uuid: ACCOUNT_UUID,
      settings: {
        kind: "zulip" as const,
        server_url: "https://zulip.example.com",
        email: "user@example.com",
        api_key: "secret",
        selection_mode: "explicit" as const,
        history_depth: "30_days" as const,
        default_project_id: PROJECT_UUID,
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

  it("updates synchronization settings with the account revision", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(jsonResponse({ ...accountDto, revision: 2 }));
    const body = {
      settings: {
        kind: "zulip" as const,
        selection_mode: "all" as const,
        history_depth: "7_days" as const,
        default_project_id: PROJECT_UUID,
      },
    };

    await updateExternalAccount(
      { accessToken: "access-token", fetchImpl: fetchMock },
      ACCOUNT_UUID,
      body,
      1,
    );

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/external_accounts/${ACCOUNT_UUID}`);
    expect(init?.method).toBe("PUT");
    expect(new Headers(init?.headers).get("If-Match")).toBe('"1"');
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("lists and changes external chat selection through provider-neutral routes", async () => {
    const listFetch = vi.fn<typeof fetch>();
    listFetch.mockResolvedValue(jsonResponse([chatDto]));
    await expect(
      getExternalChats({ accessToken: "access-token", fetchImpl: listFetch }, ACCOUNT_UUID),
    ).resolves.toEqual([chatDto]);
    expect(firstFetchCall(listFetch)[0]).toBe(
      `/api/workspace/v1/messenger/external_chats/?external_account_uuid=${ACCOUNT_UUID}`,
    );

    const selectFetch = vi.fn<typeof fetch>();
    selectFetch.mockResolvedValue(
      jsonResponse({ ...chatDto, selected: true, project_id: PROJECT_UUID, status: "syncing" }),
    );
    await selectExternalChat(
      { accessToken: "access-token", fetchImpl: selectFetch },
      CHAT_UUID,
      PROJECT_UUID,
    );
    const [selectUrl, selectInit] = firstFetchCall(selectFetch);
    expect(selectUrl).toBe(
      `/api/workspace/v1/messenger/external_chats/${CHAT_UUID}/actions/select/invoke`,
    );
    expect(selectInit?.body).toBe(JSON.stringify({ project_id: PROJECT_UUID }));

    const deselectFetch = vi.fn<typeof fetch>();
    deselectFetch.mockResolvedValue(jsonResponse(chatDto));
    await deselectExternalChat(
      { accessToken: "access-token", fetchImpl: deselectFetch },
      CHAT_UUID,
    );
    const [deselectUrl, deselectInit] = firstFetchCall(deselectFetch);
    expect(deselectUrl).toBe(
      `/api/workspace/v1/messenger/external_chats/${CHAT_UUID}/actions/deselect/invoke`,
    );
    expect(deselectInit?.body).toBeUndefined();
  });

  it("reads and updates provider policy with ETag and exposes aggregate health", async () => {
    const getPolicyFetch = vi.fn<typeof fetch>();
    getPolicyFetch.mockResolvedValue(jsonResponse(policyDto, 200, { ETag: '"2"' }));
    await expect(
      getExternalProviderPolicy({ accessToken: "access-token", fetchImpl: getPolicyFetch }),
    ).resolves.toEqual({ policy: policyDto, etag: '"2"' });

    const updateFetch = vi.fn<typeof fetch>();
    updateFetch.mockResolvedValue(
      jsonResponse({ ...policyDto, revision: 3 }, 200, { ETag: '"3"' }),
    );
    const updateBody = {
      settings: {
        kind: "zulip" as const,
        enabled: true,
        limits: policyDto.limits,
        custom_ca_bundle: null,
      },
    };
    await updateExternalProviderPolicy(
      { accessToken: "access-token", fetchImpl: updateFetch },
      updateBody,
      '"2"',
    );
    const [updateUrl, updateInit] = firstFetchCall(updateFetch);
    expect(updateUrl).toBe("/api/workspace/v1/messenger/external_provider_policies/zulip");
    expect(new Headers(updateInit?.headers).get("If-Match")).toBe('"2"');
    expect(updateInit?.body).toBe(JSON.stringify(updateBody));

    const suspendFetch = vi.fn<typeof fetch>();
    suspendFetch.mockResolvedValue(
      jsonResponse({ ...policyDto, emergency_suspended: true, revision: 3 }),
    );
    await changeExternalProviderSuspension(
      { accessToken: "access-token", fetchImpl: suspendFetch },
      "suspend",
    );
    expect(firstFetchCall(suspendFetch)[0]).toBe(
      "/api/workspace/v1/messenger/external_provider_policies/zulip/actions/suspend/invoke",
    );

    const healthFetch = vi.fn<typeof fetch>();
    healthFetch.mockResolvedValue(jsonResponse(healthDto));
    await expect(
      getExternalProviderHealth({ accessToken: "access-token", fetchImpl: healthFetch }),
    ).resolves.toEqual(healthDto);
    expect(firstFetchCall(healthFetch)[0]).toBe(
      "/api/workspace/v1/messenger/external_provider_health/zulip",
    );
  });
});
