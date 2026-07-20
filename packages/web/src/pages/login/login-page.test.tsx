import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as WorkspaceAuthLibModule from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { WorkspaceIamAuthError } from "~/shared/api/workspace-iam-auth";
import { renderWithProviders } from "~/test/render";
import { LoginPage } from "./login-page.ui";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchWorkspaceServerSettingsForOrganization = vi.hoisted(() => vi.fn());
const prepareWorkspaceProjectLogin = vi.hoisted(() => vi.fn());
const completeWorkspaceProjectLogin = vi.hoisted(() => vi.fn());

const VALID_SERVER_SETTINGS = {
  result: "success",
  msg: "",
  authentication_methods: {
    password: true,
    dev: false,
    email: true,
    ldap: false,
    remoteuser: false,
    github: false,
    azuread: false,
    gitlab: false,
    google: false,
    apple: false,
    saml: false,
    "openid connect": false,
  },
  push_notifications_enabled: false,
  email_auth_enabled: true,
  require_email_format_usernames: true,
  realm_name: "Example Workspace",
  realm_uri: "https://chat.example.com",
  realm_url: "https://chat.example.com",
  realm_icon: "",
  realm_description: "",
  realm_web_public_access_enabled: false,
  external_authentication_methods: [],
};

const PREPARED_LOGIN = {
  organizationUrl: "https://chat.example.com",
  organizationOrigin: "https://chat.example.com",
  login: "user@example.com",
  userUuid: "user-1",
  accessToken: "temporary-access-token",
  refreshToken: "temporary-refresh-token",
  projects: [
    {
      id: "project-a",
      name: "Customer support",
      description: "Support team conversations",
      organizationName: "Example organization",
    },
    { id: "project-b", name: "Product", organizationName: "Example organization" },
  ],
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/workspace-auth/workspace-auth.lib", async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceAuthLibModule>();
  return {
    ...actual,
    completeWorkspaceProjectLogin,
    fetchWorkspaceServerSettingsForOrganization,
    prepareWorkspaceProjectLogin,
  };
});

async function moveToCredentialsStep(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/zulip server address/i), {
    target: { value: "https://chat.example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await screen.findByLabelText(/email or login/i);
}

async function moveToProjectStep(): Promise<void> {
  await moveToCredentialsStep();
  fireEvent.change(screen.getByLabelText(/email or login/i), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  await waitFor(() => {
    expect(prepareWorkspaceProjectLogin).toHaveBeenCalledTimes(1);
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue(VALID_SERVER_SETTINGS);
    prepareWorkspaceProjectLogin.mockResolvedValue(PREPARED_LOGIN);
    completeWorkspaceProjectLogin.mockResolvedValue({});
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    localStorage.removeItem("workspace-auth-sessions");
    localStorage.removeItem("workspace-auth-current-account");
    navigateSpy.mockReset();
    fetchWorkspaceServerSettingsForOrganization.mockReset();
    prepareWorkspaceProjectLogin.mockReset();
    completeWorkspaceProjectLogin.mockReset();
  });

  it("renders only the organization field on the first step", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(screen.getByPlaceholderText("https://chat.example.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("email@example.com or login")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••••••")).not.toBeInTheDocument();
  });

  it("always shows login and password after organization discovery", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();

    expect(fetchWorkspaceServerSettingsForOrganization).toHaveBeenCalledWith(
      "https://chat.example.com",
    );
    expect(screen.getByText("Example Workspace")).toBeInTheDocument();
    expect(screen.getByLabelText(/email or login/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText(/show password|hide password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/workspace project/i)).not.toBeInTheDocument();
  });

  it("accepts a username that is not an email address", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();
    fireEvent.change(screen.getByLabelText(/email or login/i), {
      target: { value: "plain-login" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(prepareWorkspaceProjectLogin).toHaveBeenCalledWith({
        organizationUrl: "https://chat.example.com",
        login: "plain-login",
        password: "secret",
      });
    });
  });

  it("shows the one-time code step only after IAM requests it", async () => {
    prepareWorkspaceProjectLogin.mockRejectedValueOnce(
      new WorkspaceIamAuthError("OTP required", 401, {
        error: "invalid_client",
        error_description: "The provided otp code is invalid",
      }),
    );
    prepareWorkspaceProjectLogin.mockResolvedValueOnce(PREPARED_LOGIN);
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();
    fireEvent.change(screen.getByLabelText(/email or login/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByLabelText(/authentication code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^project$/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm code/i }));

    await waitFor(() => {
      expect(prepareWorkspaceProjectLogin).toHaveBeenLastCalledWith({
        organizationUrl: "https://chat.example.com",
        login: "user@example.com",
        password: "secret",
        otpCode: "123456",
      });
    });
    expect(await screen.findByLabelText(/^project$/i)).toBeInTheDocument();
  });

  it("keeps the one-time code step open when IAM rejects the code", async () => {
    const otpError = new WorkspaceIamAuthError("OTP required", 401, {
      error: "invalid_client",
      error_description: "The provided otp code is invalid",
    });
    prepareWorkspaceProjectLogin.mockRejectedValueOnce(otpError).mockRejectedValueOnce(otpError);
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();
    fireEvent.change(screen.getByLabelText(/email or login/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    const codeInput = await screen.findByLabelText(/authentication code/i);

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm code/i }));

    expect(await screen.findByText(/authentication code is invalid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/authentication code/i)).toHaveValue("");
  });

  it("keeps credentials hidden when organization discovery fails", async () => {
    fetchWorkspaceServerSettingsForOrganization.mockRejectedValueOnce(new Error("network"));
    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(
      await screen.findByText(
        /could not load organization settings\. check the server address and try again\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/email or login/i)).not.toBeInTheDocument();
  });

  it("loads projects after credentials and completes login for the selected project", async () => {
    renderWithProviders(<LoginPage />, {
      route: "/login?redirectTo=%2Finbox",
    });

    await moveToProjectStep();

    expect(prepareWorkspaceProjectLogin).toHaveBeenCalledWith({
      organizationUrl: "https://chat.example.com",
      login: "user@example.com",
      password: "secret",
    });
    expect(await screen.findByRole("option", { name: /customer support/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^project$/i)).toHaveValue("project-a");
    expect(screen.queryByText("Support team conversations")).not.toBeInTheDocument();
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(completeWorkspaceProjectLogin).toHaveBeenCalledWith({
        preparedLogin: PREPARED_LOGIN,
        projectId: "project-a",
      });
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("selects the only available project by default", async () => {
    prepareWorkspaceProjectLogin.mockResolvedValue({
      ...PREPARED_LOGIN,
      projects: [PREPARED_LOGIN.projects[0]],
    });
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToProjectStep();

    expect(screen.getByLabelText(/^project$/i)).toHaveValue("project-a");
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();
  });

  it("shows a blocking empty state when no projects are available", async () => {
    prepareWorkspaceProjectLogin.mockResolvedValue({ ...PREPARED_LOGIN, projects: [] });
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToProjectStep();

    expect(
      await screen.findByText(/does not have access to any projects in this organization/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /login/i })).not.toBeInTheDocument();
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();
  });

  it("does not render legacy external auth providers", async () => {
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          login_url: "/accounts/login/google/",
        },
      ],
    });

    renderWithProviders(<LoginPage />, { route: "/login" });
    await moveToCredentialsStep();

    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
  });
});
