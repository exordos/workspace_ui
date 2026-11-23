import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAuthFlowError } from "~/entities/workspace-auth/workspace-auth.lib";
import type * as WorkspaceAuthLibModule from "~/entities/workspace-auth/workspace-auth.lib";
import type { WorkspaceReauthRequiredAccount } from "~/entities/workspace-auth/workspace-auth.model";
import { WorkspaceIamAuthError } from "~/shared/api/workspace-iam-auth";
import { WorkspaceLoginForm } from "./workspace-login-form.ui";

const reauthorizeWorkspaceAccount = vi.hoisted(() => vi.fn());
const fetchWorkspaceServerSettingsForOrganization = vi.hoisted(() => vi.fn());

vi.mock("~/entities/workspace-auth/workspace-auth.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceAuthLibModule>();
  return {
    ...actual,
    fetchWorkspaceServerSettingsForOrganization,
    reauthorizeWorkspaceAccount,
  };
});

const account: WorkspaceReauthRequiredAccount = {
  accountId: "example.com:project-a:user-1",
  instanceId: "instance-1",
  organizationId: "example.com",
  organizationOrigin: "https://example.com",
  projectId: "project-a",
  projectName: "Support",
  userUuid: "user-1",
  login: "old@example.com",
  profile: {
    uuid: "user-1",
    username: "user",
    firstName: null,
    lastName: null,
    email: "old@example.com",
  },
};

const restoredSession = {
  ...account,
  accessToken: "test-access",
  refreshToken: "test-refresh",
  runtimeGeneration: 1,
};

function enterPassword() {
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in again/i }));
}

describe("WorkspaceLoginForm in reauthorization mode", () => {
  beforeEach(() => {
    reauthorizeWorkspaceAccount.mockReset();
    fetchWorkspaceServerSettingsForOrganization.mockReset();
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue({
      realm_name: "Workspace organization",
      realm_icon: "",
      registration_url: "https://example.com/register",
    });
  });

  it("uses the saved account and asks for a code only when IAM challenges the password grant", async () => {
    const challenge = new WorkspaceIamAuthError("OTP required", 401, {});
    reauthorizeWorkspaceAccount
      .mockRejectedValueOnce(challenge)
      .mockRejectedValueOnce(challenge)
      .mockResolvedValueOnce(restoredSession);
    const onSuccess = vi.fn();
    render(<WorkspaceLoginForm reauthAccount={account} onSuccess={onSuccess} />);

    expect(await screen.findByText("Workspace organization")).toBeVisible();
    expect(screen.getByTestId("realm-logo-preview")).toBeVisible();
    expect(screen.getByText("Support")).toBeVisible();
    expect(screen.getByLabelText(/email or login/i)).toHaveValue(account.login);
    expect(screen.queryByLabelText(/authentication code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/server address/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /register/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email or login/i), {
      target: { value: "new@example.com" },
    });
    enterPassword();
    const code = await screen.findByLabelText(/authentication code/i);
    expect(code).toHaveFocus();
    expect(reauthorizeWorkspaceAccount).toHaveBeenNthCalledWith(1, {
      accountId: account.accountId,
      login: "new@example.com",
      password: "secret",
      signal: expect.any(AbortSignal),
    });

    fireEvent.change(code, { target: { value: "456789" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm code/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/code is invalid/i);
    expect(code).toHaveValue("");
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm code/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(restoredSession));
    expect(screen.queryByRole("combobox", { name: /project/i })).not.toBeInTheDocument();
    expect(reauthorizeWorkspaceAccount).toHaveBeenNthCalledWith(3, {
      accountId: account.accountId,
      login: "new@example.com",
      password: "secret",
      otpCode: "123456",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ["owner-mismatch", /credentials for this account/i],
    ["missing-project", /no longer has access to this project/i],
  ] as const)("shows an actionable error for %s", async (code, message) => {
    reauthorizeWorkspaceAccount.mockRejectedValueOnce(new WorkspaceAuthFlowError(code, "details"));
    const onSuccess = vi.fn();
    render(<WorkspaceLoginForm reauthAccount={account} onSuccess={onSuccess} />);

    enterPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("associates labels with their own fields when reauthorization is open in two places", async () => {
    const otherAccount = {
      ...account,
      accountId: "example.com:project-a:user-2",
      instanceId: "instance-2",
      login: "other@example.com",
    };
    render(
      <>
        <WorkspaceLoginForm reauthAccount={account} />
        <WorkspaceLoginForm reauthAccount={otherAccount} embedded />
      </>,
    );
    await screen.findAllByText("Workspace organization");

    const [activeLogin, backgroundLogin] = screen.getAllByLabelText(/email or login/i);
    const [activePassword, backgroundPassword] = screen.getAllByLabelText(/^password$/i);
    expect(activeLogin).toHaveValue(account.login);
    expect(backgroundLogin).toHaveValue(otherAccount.login);
    expect(activeLogin?.id).not.toBe(backgroundLogin?.id);
    expect(activePassword?.id).not.toBe(backgroundPassword?.id);
  });

  it("aborts pending authentication and resets credentials when its owner changes", async () => {
    const { promise, resolve } = Promise.withResolvers<typeof restoredSession>();
    let signal: AbortSignal | undefined;
    reauthorizeWorkspaceAccount.mockImplementationOnce((params: { signal: AbortSignal }) => {
      signal = params.signal;
      return promise;
    });
    const onSuccess = vi.fn();
    const { rerender } = render(
      <WorkspaceLoginForm reauthAccount={account} onSuccess={onSuccess} />,
    );

    enterPassword();
    const nextAccount = {
      ...account,
      accountId: "example.com:project-a:user-2",
      instanceId: "instance-2",
      login: "other@example.com",
    };
    rerender(<WorkspaceLoginForm reauthAccount={nextAccount} onSuccess={onSuccess} />);

    expect(signal?.aborted).toBe(true);
    expect(screen.getByLabelText(/email or login/i)).toHaveValue(nextAccount.login);
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("");

    await act(async () => {
      resolve(restoredSession);
      await promise;
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
