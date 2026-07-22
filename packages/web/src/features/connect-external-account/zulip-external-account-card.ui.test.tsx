import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useConnectExternalAccount } from "./connect-external-account.hook";
import { ZulipExternalAccountCard } from "./zulip-external-account-card.ui";

vi.mock("./connect-external-account.hook", () => ({
  useConnectExternalAccount: vi.fn(),
}));

const runtimeContext = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "22222222-2222-4222-8222-222222222222",
  userUuid: "11111111-1111-4111-8111-111111111111",
  accessToken: "access-token",
  runtimeGeneration: 1,
} satisfies WorkspaceRuntimeContext;

const connectedAccount = {
  uuid: "33333333-3333-4333-8333-333333333333",
  serverUrl: "https://zulip.example.com",
  email: "user@example.com",
  accountType: "zulip" as const,
  selectionMode: "explicit" as const,
  historyDepth: "30_days" as const,
  defaultProjectId: runtimeContext.projectId,
  credentialPresent: true,
  status: "live" as const,
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  createdAt: "2026-07-22T10:00:00Z",
  updatedAt: "2026-07-22T10:00:00Z",
};

function connectionVm(accounts: ExternalAccount[] = []) {
  return {
    draft: { provider: "zulip" as const, serverUrl: "", email: "", apiKey: "" },
    accounts,
    submitting: false,
    loadingAccounts: false,
    error: null,
    duplicateZulip: accounts.length > 0,
    setProvider: vi.fn(),
    setServerUrl: vi.fn(),
    setEmail: vi.fn(),
    setApiKey: vi.fn(),
    submit: vi.fn(),
  };
}

describe("ZulipExternalAccountCard", () => {
  beforeEach(() => {
    vi.mocked(useConnectExternalAccount).mockReturnValue(connectionVm());
  });

  it("opens the transferred inline Zulip connection form", () => {
    render(<ZulipExternalAccountCard runtimeContext={runtimeContext} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Zulip account" }));

    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Zulip email")).toBeInTheDocument();
    expect(screen.getByLabelText("Zulip API key")).toBeInTheDocument();
  });

  it("shows the sanitized connected account without reopening the credential form", () => {
    vi.mocked(useConnectExternalAccount).mockReturnValue(connectionVm([connectedAccount]));

    render(<ZulipExternalAccountCard runtimeContext={runtimeContext} />);

    expect(screen.getByText("Account connected")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Zulip account" })).not.toBeInTheDocument();
  });
});
