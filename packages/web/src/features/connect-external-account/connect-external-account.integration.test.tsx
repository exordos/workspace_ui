import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptWorkspaceExternalAccountDto } from "~/entities/external-account/external-account-adapters.lib";
import { useExternalAccountStore } from "~/entities/external-account/external-account.model";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { replaceWorkspaceExternalAccountCache } from "~/shared/lib/workspace-external-account-cache-db";
import { renderWithProviders } from "~/test/render";
import { ConnectExternalAccountDialog } from "./connect-external-account-dialog.ui";

vi.mock("~/entities/workspace-auth/workspace-auth.lib", () => ({
  ensureFreshWorkspaceSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/shared/lib/workspace-external-account-cache-db", () => ({
  readWorkspaceExternalAccountCache: vi.fn().mockResolvedValue([]),
  replaceWorkspaceExternalAccountCache: vi.fn().mockResolvedValue(undefined),
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "project-1",
  userUuid: "user-1",
  accessToken: "test-token",
  runtimeGeneration: 1,
};

const TEST_API_KEY = "dummy-key";
const EXISTING_API_KEY = "existing-private-key";

function FormHost({ editAccount }: { readonly editAccount?: ExternalAccount }) {
  const [open, setOpen] = useState(true);
  return (
    <ConnectExternalAccountDialog
      open={open}
      onOpenChange={setOpen}
      runtimeContext={runtimeContext}
      editAccount={editAccount}
    />
  );
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("external account registration form", () => {
  afterEach(() => {
    useExternalAccountStore.getState().clear();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("closes after a 201 registry response without waiting for bridge initialization", async () => {
    const saved = {
      uuid: "33333333-3333-4333-8333-333333333333",
      provider: "zulip",
      settings: {
        kind: "zulip",
        server_url: "https://zulip.example.invalid",
        email: "test@example.invalid",
        api_key: TEST_API_KEY,
        selection_mode: "all",
        history_depth: "all",
        default_project_id: runtimeContext.projectId,
      },
      status: "new",
      revision: 1,
      created_at: "2026-10-17T10:00:00Z",
      updated_at: "2026-10-17T10:00:00Z",
    };
    vi.spyOn(crypto, "randomUUID").mockReturnValue("33333333-3333-4333-8333-333333333333");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      Promise.resolve(
        new Response(JSON.stringify(init?.method === "POST" ? saved : []), {
          status: init?.method === "POST" ? 201 : 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<FormHost />);
    await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: saved.settings.server_url },
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: saved.settings.email } });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: saved.settings.api_key },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    const body = posts[0]?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON request body");
    expect(JSON.parse(body)).toMatchObject({ provider: "zulip" });
    expect(useExternalAccountStore.getState().accounts[0]).toMatchObject({
      uuid: saved.uuid,
      status: "new",
    });
    expect(JSON.stringify(useExternalAccountStore.getState().accounts)).not.toContain(TEST_API_KEY);
  });

  it("keeps the form open when the server refuses account creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((_input, init) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              init?.method === "POST"
                ? {
                    type: "ExternalResourceForbiddenError",
                    message: "Forbidden",
                  }
                : [],
            ),
            {
              status: init?.method === "POST" ? 403 : 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );
    renderWithProviders(<FormHost />);
    await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: "https://zulip.example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.invalid" } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: TEST_API_KEY } });
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "External service connections are unavailable",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(useExternalAccountStore.getState().accounts).toEqual([]);
  });
});

const existingDto = {
  uuid: "33333333-3333-4333-8333-333333333333",
  provider: "zulip" as const,
  settings: {
    server_url: "https://zulip.example.invalid",
    email: "test@example.invalid",
    api_key: EXISTING_API_KEY,
    provider_option: "preserve-me",
  },
  status: "new" as const,
  created_at: "2026-10-17T10:00:00Z",
  updated_at: "2026-10-17T11:00:00Z",
};

function accountResponse(
  input: RequestInfo | URL,
  method: string | undefined,
  updated: unknown,
): unknown {
  if (method === "PUT") return updated;
  return requestUrl(input).endsWith("/external_accounts/") ? [existingDto] : existingDto;
}

describe("external account editing", () => {
  it("fills missing credentials without adding legacy settings", async () => {
    const empty = { ...existingDto, settings: {}, status: "new" as const };
    const settings = {
      server_url: "https://zulip.example.invalid",
      email: "new@example.invalid",
      api_key: TEST_API_KEY,
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      let body: unknown = empty;
      if (requestUrl(input).endsWith("/external_accounts/")) body = [empty];
      if (init?.method === "PUT") body = { ...empty, settings };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<FormHost editAccount={adaptWorkspaceExternalAccountDto(empty)} />);
    await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
    expect(screen.getByLabelText("Server URL")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Server URL"), {
      target: { value: settings.server_url },
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: settings.email } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: settings.api_key } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[1]?.body).toBe(JSON.stringify({ settings }));
    expect(useExternalAccountStore.getState().accounts[0]?.settings).toEqual({
      kind: "zulip",
      serverUrl: settings.server_url,
      email: settings.email,
    });
    expect(JSON.stringify(useExternalAccountStore.getState().accounts)).not.toContain(TEST_API_KEY);
  });

  afterEach(() => {
    useExternalAccountStore.getState().clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(["", "replacement-private-key"])(
    "updates the same account while preserving settings and handling key %j",
    async (apiKey) => {
      const updated = {
        ...existingDto,
        settings: {
          ...existingDto.settings,
          server_url: "https://edited.example.invalid",
          email: "edited@example.invalid",
          api_key: apiKey || existingDto.settings.api_key,
        },
      };
      const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
        Promise.resolve(
          new Response(JSON.stringify(accountResponse(_input, init?.method, updated)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const account = adaptWorkspaceExternalAccountDto(existingDto);
      renderWithProviders(<FormHost editAccount={account} />);
      await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
      expect(screen.getByLabelText("Server URL")).toHaveValue(existingDto.settings.server_url);
      expect(screen.getByLabelText("Email")).toHaveValue(existingDto.settings.email);
      expect(screen.getByLabelText("API key")).toHaveValue("");
      expect(screen.getByLabelText("API key")).not.toBeRequired();
      fireEvent.change(screen.getByLabelText("Server URL"), {
        target: { value: updated.settings.server_url },
      });
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: updated.settings.email },
      });
      fireEvent.change(screen.getByLabelText("API key"), { target: { value: apiKey } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0]?.[0]).toContain(`/external_accounts/${existingDto.uuid}`);
      expect(puts[0]?.[1]?.body).toBe(JSON.stringify({ settings: updated.settings }));
      expect(new Headers(puts[0]?.[1]?.headers).has("If-Match")).toBe(false);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
      expect(useExternalAccountStore.getState().accounts).toHaveLength(1);
      expect(useExternalAccountStore.getState().accounts[0]?.settings.email).toBe(
        updated.settings.email,
      );
      const cached = vi.mocked(replaceWorkspaceExternalAccountCache).mock.calls.at(-1);
      expect(cached?.[0]).toBe(workspaceRuntimeOwnerKey(runtimeContext));
      expect(JSON.stringify(cached?.[1])).not.toContain("private-key");
      expect(JSON.stringify(useExternalAccountStore.getState().accounts)).not.toContain(
        "private-key",
      );
    },
  );

  it("keeps edits and the form open when PUT fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((_input, init) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              accountResponse(_input, init?.method, { type: "ExternalResourceForbiddenError" }),
            ),
            {
              status: init?.method === "PUT" ? 403 : 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    );
    renderWithProviders(<FormHost editAccount={adaptWorkspaceExternalAccountDto(existingDto)} />);
    await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "edited@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "External service connections are unavailable",
      ),
    );
    expect(screen.getByLabelText("Email")).toHaveValue("edited@example.invalid");
    expect(useExternalAccountStore.getState().accounts[0]?.settings.email).toBe(
      existingDto.settings.email,
    );
  });

  it("preserves a newer server URL when only the email was edited", async () => {
    const latest = {
      ...existingDto,
      settings: { ...existingDto.settings, server_url: "https://newer.example.invalid" },
    };
    const updated = {
      ...latest,
      settings: { ...latest.settings, email: "edited@example.invalid" },
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      let body: unknown = latest;
      if (requestUrl(input).endsWith("/external_accounts/")) body = [existingDto];
      if (init?.method === "PUT") body = updated;
      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<FormHost editAccount={adaptWorkspaceExternalAccountDto(existingDto)} />);
    await waitFor(() => expect(useExternalAccountStore.getState().loadStatus).toBe("ready"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: updated.settings.email } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[1]?.body).toBe(JSON.stringify({ settings: updated.settings }));
  });
});
