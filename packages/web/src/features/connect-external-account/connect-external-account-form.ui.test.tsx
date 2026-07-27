import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import type { ConnectExternalAccountFormProps } from "./connect-external-account.types";

const draft = {
  provider: "zulip" as const,
  serverUrl: "",
  email: "",
  apiKey: "",
  selectionMode: "explicit" as const,
  historyDepth: "30_days" as const,
};

const account = {
  uuid: "account-1",
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
  status: "live" as const,
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  etag: '"1"',
  createdAt: "2026-07-10T08:00:00Z",
  updatedAt: "2026-07-10T09:00:00Z",
};

function renderForm(overrides: Partial<ConnectExternalAccountFormProps> = {}) {
  const props: ConnectExternalAccountFormProps = {
    draft,
    duplicateZulip: false,
    submitting: false,
    error: null,
    onProviderChange: vi.fn(),
    onServerUrlChange: vi.fn(),
    onEmailChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onSelectionModeChange: vi.fn(),
    onHistoryDepthChange: vi.fn(),
    showSyncSettings: true,
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<ConnectExternalAccountForm {...props} />);
  return props;
}

describe("ConnectExternalAccountForm", () => {
  it("renders the universal three-field Zulip connection form", () => {
    const props = renderForm();

    expect(screen.getByRole("combobox")).toHaveValue("zulip");
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("group", { name: "Which chats should be connected?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Choose manually" })).toBeChecked();
    expect(
      screen.getByRole("group", { name: "How much history should be loaded?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "30 days" })).toBeChecked();

    fireEvent.submit(screen.getByRole("button", { name: /connect/i }).closest("form")!);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks a second Zulip account and explains the duplicate", () => {
    renderForm({ duplicateZulip: account.provider === "zulip" });

    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
    expect(screen.getByText(/only one Zulip account/i)).toBeInTheDocument();
  });

  it("does not expose synchronization settings while reconnecting credentials", () => {
    renderForm({ showSyncSettings: false });

    expect(
      screen.queryByRole("group", { name: "Which chats should be connected?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "How much history should be loaded?" }),
    ).not.toBeInTheDocument();
  });
});
