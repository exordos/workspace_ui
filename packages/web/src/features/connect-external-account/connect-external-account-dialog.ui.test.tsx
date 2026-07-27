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

  it("allows credentials to be entered again for auth_required", () => {
    vi.mocked(useConnectExternalAccount).mockReturnValue({
      ...hookResult(),
      reconnecting: true,
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
});
