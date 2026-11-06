// @vitest-environment-options {"url":"https://workspace.example.com"}
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Link } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as WorkspaceAuthLibModule from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  readWorkspaceOrganizationHistory,
  recordSuccessfulWorkspaceOrganization,
} from "~/entities/workspace-auth/workspace-organization-history.lib";
import { DEFAULT_IAM_TOKEN_URL, WorkspaceIamAuthError } from "~/shared/api/workspace-iam-auth";
import { renderWithProviders } from "~/test/render";
import { LoginPage } from "./login-page.ui";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchWorkspaceServerSettingsForOrganization = vi.hoisted(() => vi.fn());
const prepareWorkspaceProjectLogin = vi.hoisted(() => vi.fn());
const completeWorkspaceProjectLogin = vi.hoisted(() => vi.fn());
const isElectron = vi.hoisted(() => vi.fn(() => true));

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

const COMPLETED_SESSION = {
  accountId: "chat.example.com:project-a:user-1",
  instanceId: "instance-1",
  organizationId: "chat.example.com",
  organizationOrigin: "https://chat.example.com",
  projectId: "project-a",
  userUuid: "user-1",
  login: "user@example.com",
  accessToken: "project-access-token",
  refreshToken: "project-refresh-token",
  profile: {
    uuid: "user-1",
    username: "user",
    firstName: "Test",
    lastName: "User",
    email: "user@example.com",
  },
  runtimeGeneration: 1,
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

vi.mock("~/shared/lib/electron", () => ({ isElectron }));

async function moveToCredentialsStep(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/^server address$/i), {
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
    isElectron.mockReturnValue(true);
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue(VALID_SERVER_SETTINGS);
    prepareWorkspaceProjectLogin.mockResolvedValue(PREPARED_LOGIN);
    completeWorkspaceProjectLogin.mockResolvedValue({
      session: COMPLETED_SESSION,
      serverSettings: VALID_SERVER_SETTINGS,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    localStorage.removeItem("workspace-auth-sessions");
    localStorage.removeItem("workspace-auth-current-account");
    localStorage.removeItem("workspace-organization-history-v1");
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

  it("suggests persisted organizations after a login page remount", () => {
    recordSuccessfulWorkspaceOrganization("https://chat.example.com");
    const first = renderWithProviders(<LoginPage />, { route: "/login" });
    fireEvent.focus(screen.getByRole("combobox", { name: /^server address$/i }));
    expect(screen.getByRole("option", { name: "https://chat.example.com" })).toBeInTheDocument();
    first.unmount();

    recordSuccessfulWorkspaceOrganization("https://other.example.com");
    renderWithProviders(<LoginPage />, { route: "/login" });
    fireEvent.focus(screen.getByRole("combobox", { name: /^server address$/i }));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "https://other.example.com",
      "https://chat.example.com",
    ]);
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalled();
  });

  it("fills the organization URL from history without submitting the form", () => {
    recordSuccessfulWorkspaceOrganization("https://chat.example.com");
    useWorkspaceAuthStore.setState({
      sessions: [COMPLETED_SESSION],
      currentAccountId: COMPLETED_SESSION.accountId,
    });
    renderWithProviders(<LoginPage />, { route: "/login" });
    const organization = screen.getByRole("combobox", { name: /^server address$/i });
    fireEvent.focus(organization);
    fireEvent.click(screen.getByRole("option", { name: "https://chat.example.com" }));

    expect(organization).toHaveValue("https://chat.example.com");
    expect(organization).toHaveAttribute("type", "url");
    expect(organization).toHaveAttribute("inputmode", "url");
    expect(organization).toHaveAttribute("autocomplete", "url");
    expect(organization).toBeRequired();
    expect(screen.getByRole("heading", { name: /add server/i })).toBeInTheDocument();
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalled();
    expect(prepareWorkspaceProjectLogin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/email or login/i)).not.toBeInTheDocument();
  });

  it("accepts an arbitrary URL without adding history during organization discovery", async () => {
    recordSuccessfulWorkspaceOrganization("https://previous.example.com");
    renderWithProviders(<LoginPage />, { route: "/login" });
    const organization = screen.getByRole("combobox", { name: /^server address$/i });
    fireEvent.change(organization, { target: { value: "https://new.example.com" } });

    expect(organization).toHaveValue("https://new.example.com");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(readWorkspaceOrganizationHistory()).toEqual(["https://previous.example.com"]);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email or login/i);

    expect(fetchWorkspaceServerSettingsForOrganization).toHaveBeenCalledWith(
      "https://new.example.com",
    );
    expect(readWorkspaceOrganizationHistory()).toEqual(["https://previous.example.com"]);
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();
  });

  it("keeps the configured organization button independent from history suggestions", () => {
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://default.example.com");
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_NAME", "Default organization");
    recordSuccessfulWorkspaceOrganization("https://previous.example.com");
    renderWithProviders(<LoginPage />, { route: "/login" });
    fireEvent.click(screen.getByRole("button", { name: "Default organization" }));

    expect(screen.getByRole("combobox", { name: /^server address$/i })).toHaveValue(
      "https://default.example.com",
    );
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalled();
    expect(readWorkspaceOrganizationHistory()).toEqual(["https://previous.example.com"]);
    expect(screen.queryByLabelText(/email or login/i)).not.toBeInTheDocument();
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

  const messagePath =
    "/org/chat.example.com/project/project-a/message/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const forgedRealm = "https://untrusted.example.com";

  it.each(["/login", messagePath, `/login?redirectTo=${encodeURIComponent(messagePath)}`])(
    "keeps the discovery, password and OTP destinations trusted on %s with a forged realm",
    async (path) => {
      isElectron.mockReturnValue(false);
      const trustedOrigin = "https://chat.example.com";
      vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", trustedOrigin);
      const auth = await vi.importActual<typeof WorkspaceAuthLibModule>(
        "~/entities/workspace-auth/workspace-auth.lib",
      );
      prepareWorkspaceProjectLogin.mockImplementation(auth.prepareWorkspaceProjectLogin);
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() =>
          Promise.resolve(Response.json({ error: "invalid_client" }, { status: 401 })),
        );
      const route = new URL(path, window.location.origin);
      route.searchParams.set("realm", forgedRealm);
      const initialRoute = route.pathname + route.search;
      route.searchParams.set("realm", "https://another-untrusted.example.com");
      renderWithProviders(
        <>
          <LoginPage />
          <Link to={route.pathname + route.search}>Change realm</Link>
        </>,
        { route: initialRoute },
      );

      const password = crypto.randomUUID();
      fireEvent.change(await screen.findByLabelText(/email or login/i), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: password },
      });
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByLabelText(/authentication code/i);
      fireEvent.click(screen.getByRole("link", { name: "Change realm" }));
      fireEvent.change(screen.getByLabelText(/authentication code/i), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: /confirm code/i }));
      await screen.findByText(/authentication code is invalid/i);

      expect(fetch.mock.calls).toHaveLength(2);
      for (const [index, [url, init]] of fetch.mock.calls.entries()) {
        const request = new Request(url, init);
        expect(request.url).toBe(trustedOrigin + DEFAULT_IAM_TOKEN_URL);
        expect(request.method).toBe("POST");
        expect(await request.json()).toMatchObject({
          login: "user@example.com",
          password,
        });
        expect(request.headers.get("X-OTP")).toBe(index === 0 ? null : "123456");
      }
      expect(fetchWorkspaceServerSettingsForOrganization.mock.calls).toEqual([[trustedOrigin]]);
    },
  );

  it("requires manual organization selection before credentials for an unknown linked organization", async () => {
    isElectron.mockReturnValue(false);
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://chat.example.com");
    renderWithProviders(<LoginPage />, {
      route: `/org/unknown.example.com/project/project-a/message/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?realm=${forgedRealm}&redirectTo=/inbox`,
    });
    const organization = screen.getByLabelText(/^server address$/i);
    expect(organization).toHaveValue("");
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalled();
    fireEvent.change(organization, { target: { value: "https://chat.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/organization and project/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalled();
    expect(prepareWorkspaceProjectLogin).not.toHaveBeenCalled();

    fireEvent.change(organization, { target: { value: "https://unknown.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByLabelText(/^password$/i)).toBeInTheDocument();
    expect(fetchWorkspaceServerSettingsForOrganization).toHaveBeenCalledWith(
      "https://unknown.example.com",
    );
  });

  it("returns to organization selection from the compact top action", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });
    await moveToCredentialsStep();

    fireEvent.click(screen.getByRole("button", { name: /^organization$/i }));

    expect(screen.getByLabelText(/^server address$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it.each([
    "/?realm=https://untrusted.example.com#user/33333333-3333-4333-8333-333333333333",
    "/login?realm=https://untrusted.example.com&redirectTo=%2F%23user%2F33333333-3333-4333-8333-333333333333",
  ])("uses the shared profile's web origin on %s", async (route) => {
    isElectron.mockReturnValue(false);
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://other.example.com");
    renderWithProviders(<LoginPage />, { route });
    await screen.findByLabelText(/email or login/i);
    expect(fetchWorkspaceServerSettingsForOrganization).toHaveBeenCalledWith(
      window.location.origin,
    );
    expect(fetchWorkspaceServerSettingsForOrganization).not.toHaveBeenCalledWith(
      "https://other.example.com",
    );
  });

  it("shows registration only when server settings provide a safe URL", async () => {
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
      registration_url: "https://iam.example.com/register",
    });
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();

    const registrationLink = screen.getByRole("link", { name: /^register$/i });
    expect(registrationLink).toHaveAttribute("href", "https://iam.example.com/register");
    expect(registrationLink).toHaveAttribute("target", "_blank");
  });

  it("hides registration when server settings omit the URL", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToCredentialsStep();

    expect(screen.queryByText(/no account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^register$/i })).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText(/^server address$/i), {
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
    expect(screen.getByRole("combobox", { name: /^project$/i })).toHaveTextContent(
      "Customer support — Example organization",
    );
    expect(screen.queryByText("Support team conversations")).not.toBeInTheDocument();
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(completeWorkspaceProjectLogin).toHaveBeenCalledWith({
        preparedLogin: PREPARED_LOGIN,
        projectId: "project-a",
      });
      expect(navigateSpy).toHaveBeenCalledWith(
        "/org/chat.example.com/project/project-a/messenger",
        { replace: true },
      );
    });
  });

  it.each([false, true])(
    "opens a shared profile directly after project login (explicit: %s)",
    async (explicit) => {
      const target = "/#user/33333333-3333-4333-8333-333333333333";
      renderWithProviders(<LoginPage />, {
        route: explicit ? `/login?redirectTo=${encodeURIComponent(target)}` : target,
      });
      await moveToProjectStep();
      fireEvent.click(await screen.findByRole("button", { name: /login/i }));
      await waitFor(() =>
        expect(navigateSpy).toHaveBeenCalledWith(
          "/org/chat.example.com/project/project-a/inbox#user/33333333-3333-4333-8333-333333333333",
          { replace: true },
        ),
      );
    },
  );

  it("selects the only available project by default", async () => {
    prepareWorkspaceProjectLogin.mockResolvedValue({
      ...PREPARED_LOGIN,
      projects: [PREPARED_LOGIN.projects[0]],
    });
    renderWithProviders(<LoginPage />, { route: "/login" });

    await moveToProjectStep();

    expect(screen.getByRole("combobox", { name: /^project$/i })).toHaveTextContent(
      "Customer support — Example organization",
    );
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();
  });

  it("selects the linked project and returns to the message after login", async () => {
    const target =
      "/org/chat.example.com/project/project-b/message/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    completeWorkspaceProjectLogin.mockResolvedValue({
      session: { ...COMPLETED_SESSION, projectId: "project-b" },
      serverSettings: VALID_SERVER_SETTINGS,
    });
    renderWithProviders(<LoginPage />, { route: target });
    await moveToProjectStep();
    expect(screen.getByRole("combobox", { name: /^project$/i })).toHaveTextContent("Product");
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith(target, { replace: true }));
    expect(completeWorkspaceProjectLogin).toHaveBeenCalledWith({
      preparedLogin: PREPARED_LOGIN,
      projectId: "project-b",
    });
  });

  it("keeps the existing session when credentials do not grant access to the linked project", async () => {
    renderWithProviders(<LoginPage />, {
      route:
        "/org/chat.example.com/project/unavailable/message/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    await moveToProjectStep();
    expect(await screen.findByText(/organization and project/i)).toBeInTheDocument();
    expect(completeWorkspaceProjectLogin).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
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
