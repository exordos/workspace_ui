import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import type { ConnectExternalAccountFormProps } from "./connect-external-account.types";

const draft = {
  provider: "zulip" as const,
  serverUrl: "",
  email: "",
  apiKey: "",
};

const account = {
  uuid: "account-1",
  serverUrl: "https://zulip.example.com",
  email: "user@example.com",
  accountType: "zulip" as const,
  selectionMode: "explicit" as const,
  historyDepth: "30_days" as const,
  defaultProjectId: "project-1",
  credentialPresent: true,
  status: "live" as const,
  liveReady: true,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  createdAt: "2026-07-10T08:00:00Z",
  updatedAt: "2026-07-10T09:00:00Z",
};

function renderForm(overrides: Partial<ConnectExternalAccountFormProps> = {}) {
  const props: ConnectExternalAccountFormProps = {
    draft,
    accounts: [],
    submitting: false,
    error: null,
    onProviderChange: vi.fn(),
    onServerUrlChange: vi.fn(),
    onEmailChange: vi.fn(),
    onApiKeyChange: vi.fn(),
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
    expect(screen.getByLabelText("Zulip email")).toBeInTheDocument();
    expect(screen.getByLabelText("Zulip API key")).toHaveAttribute("type", "password");

    fireEvent.submit(screen.getByRole("button", { name: /connect/i }).closest("form")!);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks a second Zulip account and explains the duplicate", () => {
    renderForm({ accounts: [account] });

    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
    expect(screen.getByText(/only one Zulip account/i)).toBeInTheDocument();
  });

  it("explains a forbidden integration without exposing the backend error", () => {
    renderForm({ error: "forbidden" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The Zulip integration is unavailable for your account",
    );
    expect(screen.queryByText(/ExternalResourceForbiddenError/i)).not.toBeInTheDocument();
  });
});
