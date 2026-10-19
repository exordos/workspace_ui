import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { ConnectExternalAccountDialog } from "./connect-external-account-dialog.ui";
import { useConnectExternalAccount } from "./connect-external-account.hook";
import type { UseConnectExternalAccountResult } from "./connect-external-account.hook";

vi.mock("./connect-external-account.hook", () => ({
  useConnectExternalAccount: vi.fn(),
}));

const baseAccount = {
  uuid: "external-account-1",
  provider: "zulip" as const,
  settings: {
    kind: "zulip" as const,
    serverUrl: "https://zulip.example.com",
    email: "user@example.com",
    selectionMode: "explicit" as const,
    historyDepth: "30_days" as const,
    defaultProjectId: "project-1",
  },
  credentialPresent: true,
  status: "connecting" as const,
  liveReady: false,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 0,
  lastProgressAt: null,
  revision: 1,
  etag: '"1"',
  createdAt: "2026-07-23T10:00:00Z",
  updatedAt: "2026-07-23T10:00:00Z",
};

function hookResult(): UseConnectExternalAccountResult {
  return {
    draft: {
      provider: "zulip" as const,
      serverUrl: "",
      email: "",
      apiKey: "",
    },
    accounts: [],
    lifecycleAccount: baseAccount,
    phase: "checking",
    submitting: false,
    loadingAccounts: false,
    error: null,
    duplicateZulip: false,
    reconnecting: false,
    setProvider: vi.fn(),
    setServerUrl: vi.fn(),
    setEmail: vi.fn(),
    setApiKey: vi.fn(),
    submit: vi.fn(),
    resetCredentials: vi.fn(),
  };
}

describe("ConnectExternalAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConnectExternalAccount).mockReturnValue(hookResult());
  });

  it("shows lifecycle progress instead of declaring success after POST", () => {
    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={vi.fn()} runtimeContext={null} />,
    );

    expect(screen.getByText("Checking connection…")).toBeInTheDocument();
    expect(screen.queryByText("Account connected")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });

  it("shows saving while POST has not returned a snapshot yet", () => {
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      lifecycleAccount: null,
      phase: "checking",
    });

    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={vi.fn()} runtimeContext={null} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Saving account");
  });

  it("allows credentials to be entered again for auth_required", () => {
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      reconnecting: true,
      phase: "credentials",
      lifecycleAccount: {
        ...baseAccount,
        status: "auth_required",
        safeError: "Credentials expired",
      },
    });
    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={vi.fn()} runtimeContext={null} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Credentials expired");
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
  });

  it("keeps a late degraded error visible and allows reconnecting", () => {
    const resetCredentials = vi.fn();
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      reconnecting: true,
      phase: "checking",
      resetCredentials,
      lifecycleAccount: {
        ...baseAccount,
        status: "degraded",
        safeError: "Bridge stopped",
      },
    });

    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={vi.fn()} runtimeContext={null} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Bridge stopped");
    screen.getByRole("button", { name: "Enter credentials again" }).click();
    expect(resetCredentials).toHaveBeenCalledOnce();
  });

  it("shows automatic completion without mounting the catalog", () => {
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      phase: "automaticDone",
      lifecycleAccount: {
        ...baseAccount,
        status: "backfill",
        appliedGeneration: 1,
        settings: { ...baseAccount.settings, selectionMode: "all" },
      },
    });

    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={vi.fn()} runtimeContext={null} />,
    );

    expect(
      screen.getByText(/all chats and their full history will be synchronized automatically/i),
    ).toBeInTheDocument();
  });

  it("dismisses from the AppDialog header close control instead of a footer Close", () => {
    const onOpenChange = vi.fn();
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      phase: "credentials",
      lifecycleAccount: null,
    });

    renderWithProviders(
      <ConnectExternalAccountDialog open onOpenChange={onOpenChange} runtimeContext={null} />,
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.closest("[data-app-dialog-title-row]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Close$/ })).toBe(close);
    close.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
