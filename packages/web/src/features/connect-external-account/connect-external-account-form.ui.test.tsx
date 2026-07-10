import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectExternalAccountForm } from "./connect-external-account-form.ui";
import type { ConnectExternalAccountFormProps } from "./connect-external-account.types";

const draft = {
  provider: "zulip" as const,
  serverUrl: "",
  login: "",
  token: "",
};

const account = {
  uuid: "account-1",
  projectId: "project-1",
  userUuid: "user-1",
  serverUrl: "https://zulip.example.com",
  sourceScope: "https://zulip.example.com",
  accountType: "zulip" as const,
  status: "active" as const,
  accessStatus: "confirmed" as const,
  accessCheckedAt: null,
  accessConfirmedAt: null,
  accessNextCheckAt: "2026-07-10T10:00:00Z",
  accessLastError: null,
  accountSettingsKind: "zulip" as const,
  userInfo: null,
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
    onLoginChange: vi.fn(),
    onTokenChange: vi.fn(),
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
    expect(screen.getByLabelText("Login")).toBeInTheDocument();
    expect(screen.getByLabelText("Token")).toHaveAttribute("type", "password");

    fireEvent.submit(screen.getByRole("button", { name: /connect/i }).closest("form")!);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks a second Zulip account and explains the duplicate", () => {
    renderForm({ accounts: [account] });

    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
    expect(screen.getByText(/only one Zulip account/i)).toBeInTheDocument();
  });
});
