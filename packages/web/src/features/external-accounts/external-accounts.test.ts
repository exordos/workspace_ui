import { afterEach, describe, expect, it, vi } from "vitest";

const messengerApi = vi.hoisted(() => ({
  getWithBase: vi.fn(),
  postJsonWithBase: vi.fn(),
  putJsonWithBase: vi.fn(),
  deleteWithBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  messengerApi,
  getMessengerGatewayApiBaseForCurrentInstance: vi.fn(() => "/api/messenger/v1"),
}));

function okResponse(data: unknown) {
  return {
    ok: true as const,
    status: 200,
    data,
    headers: new Headers(),
    raw: new Response(),
    durationMs: 10,
  };
}

describe("external accounts API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and maps the current Zulip account without exposing the token", async () => {
    messengerApi.getWithBase.mockResolvedValue(
      okResponse([
        {
          uuid: "account-1",
          external_user_id: "42",
          server_url: "https://zulip.example.com",
          account_type: "zulip",
          status: "active",
          account_settings: {
            kind: "zulip",
            credentials: {
              kind: "zulip",
              login: "alice@example.com",
              token: "abc123",
            },
            user_info: {
              kind: "zulip",
              user_id: 42,
              role: 400,
            },
          },
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        },
      ]),
    );

    const { fetchZulipExternalAccount } = await import("./external-accounts.api");
    const account = await fetchZulipExternalAccount();

    expect(account).toEqual({
      uuid: "account-1",
      externalUserId: "42",
      accountType: "zulip",
      hasCredentials: true,
      status: "active",
      accountSettings: {
        kind: "zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
        userInfo: {
          kind: "zulip",
          userId: 42,
          role: 400,
        },
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(account?.accountSettings).not.toHaveProperty("token");
    expect(account?.accountSettings).not.toHaveProperty("credentials");
    expect(messengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/external_accounts/",
      { account_type: "zulip" },
      undefined,
    );
  });

  it("maps a Zulip account without stored credentials as not linked", async () => {
    messengerApi.getWithBase.mockResolvedValue(
      okResponse([
        {
          uuid: "account-2",
          server_url: "https://zulip.example.com",
          account_type: "zulip",
          status: "active",
          account_settings: {
            kind: "zulip",
            credentials: null,
            user_info: {
              kind: "zulip",
              email: "synced@example.com",
              user_id: 77,
              role: 400,
            },
          },
        },
      ]),
    );

    const { fetchZulipExternalAccount } = await import("./external-accounts.api");
    const account = await fetchZulipExternalAccount();

    expect(account).toMatchObject({
      uuid: "account-2",
      accountType: "zulip",
      hasCredentials: false,
      status: "active",
      accountSettings: {
        kind: "zulip",
        login: "synced@example.com",
        serverUrl: "https://zulip.example.com",
        userInfo: {
          kind: "zulip",
          userId: 77,
          role: 400,
        },
      },
    });
  });

  it("creates a Zulip account with server URL, login, and token", async () => {
    messengerApi.postJsonWithBase.mockResolvedValue(
      okResponse({
        uuid: "account-1",
        server_url: "https://zulip.example.com",
        account_type: "zulip",
        account_settings: {
          kind: "zulip",
          credentials: {
            kind: "zulip",
            login: "alice@example.com",
          },
        },
      }),
    );

    const { saveZulipExternalAccount } = await import("./external-accounts.api");
    const result = await saveZulipExternalAccount({
      login: " alice@example.com ",
      serverUrl: " https://zulip.example.com ",
      token: " z1 ",
    });

    expect(result.ok).toBe(true);
    expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/external_accounts/",
      {
        account_type: "zulip",
        server_url: "https://zulip.example.com",
        account_settings: {
          kind: "zulip",
          credentials: {
            kind: "zulip",
            login: "alice@example.com",
            token: "z1",
          },
        },
      },
    );
  });

  it("updates an existing Zulip account by uuid", async () => {
    messengerApi.putJsonWithBase.mockResolvedValue(
      okResponse({
        uuid: "account-1",
        server_url: "https://next-zulip.example.com",
        account_type: "zulip",
        account_settings: {
          kind: "zulip",
          credentials: {
            kind: "zulip",
            login: "next@example.com",
          },
        },
      }),
    );

    const { saveZulipExternalAccount } = await import("./external-accounts.api");
    const result = await saveZulipExternalAccount({
      uuid: "account-1",
      login: "next@example.com",
      serverUrl: "https://next-zulip.example.com",
      token: "z2",
    });

    expect(result.ok).toBe(true);
    expect(messengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/external_accounts/account-1",
      expect.objectContaining({
        server_url: "https://next-zulip.example.com",
        account_settings: expect.objectContaining({
          credentials: expect.objectContaining({
            login: "next@example.com",
            token: "z2",
          }),
        }),
      }),
    );
  });

  it("maps conflict responses to a typed save error", async () => {
    messengerApi.postJsonWithBase.mockResolvedValue({
      ok: false,
      status: 409,
      data: null,
      headers: new Headers(),
      raw: new Response(),
      durationMs: 10,
    });

    const { saveZulipExternalAccount } = await import("./external-accounts.api");
    const result = await saveZulipExternalAccount({
      login: "alice@example.com",
      serverUrl: "https://zulip.example.com",
      token: "z1",
    });

    expect(result).toEqual({ ok: false, kind: "conflict" });
  });

  it("unlinks an existing Zulip account by uuid", async () => {
    messengerApi.deleteWithBase.mockResolvedValue(okResponse(null));

    const { unlinkZulipExternalAccount } = await import("./external-accounts.api");
    const result = await unlinkZulipExternalAccount(" account-1 ");

    expect(result).toEqual({ ok: true });
    expect(messengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/messenger/v1",
      "/external_accounts/account-1",
    );
  });

  it("maps unlink failures to typed errors", async () => {
    messengerApi.deleteWithBase.mockResolvedValue({
      ok: false,
      status: 403,
      data: null,
      headers: new Headers(),
      raw: new Response(),
      durationMs: 10,
    });

    const { unlinkZulipExternalAccount } = await import("./external-accounts.api");
    const result = await unlinkZulipExternalAccount("account-1");

    expect(result).toEqual({ ok: false, kind: "forbidden" });
  });
});
