import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as WorkspaceAuthLibModule from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { renderWithProviders } from "~/test/render";
import { LoginPage } from "./login-page.ui";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchWorkspaceServerSettingsForOrganization = vi.hoisted(() => vi.fn());
const loginWorkspaceWithPassword = vi.hoisted(() => vi.fn());

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
    fetchWorkspaceServerSettingsForOrganization,
    loginWorkspaceWithPassword,
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_DEFAULT_WORKSPACE_PROJECT_ID", "project-default");
    fetchWorkspaceServerSettingsForOrganization.mockResolvedValue(VALID_SERVER_SETTINGS);
    loginWorkspaceWithPassword.mockResolvedValue({});
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null, runtimeGeneration: 0 });
    localStorage.removeItem("workspace-auth-sessions");
    localStorage.removeItem("workspace-auth-current-account");
    navigateSpy.mockReset();
    fetchWorkspaceServerSettingsForOrganization.mockReset();
    loginWorkspaceWithPassword.mockReset();
  });

  it("renders only organization field on the first step", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(screen.getByPlaceholderText("https://chat.example.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("email@example.com or login")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••••••")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("loads Workspace server settings before showing credentials", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(fetchWorkspaceServerSettingsForOrganization).toHaveBeenCalledWith(
        "https://chat.example.com",
      );
    });

    expect(await screen.findByText("Example Workspace")).toBeInTheDocument();
    expect(await screen.findByLabelText(/workspace project/i)).toHaveValue("project-default");
    expect(await screen.findByPlaceholderText("email@example.com or login")).toBeInTheDocument();
  });

  it("uses IAM login with the default Workspace project id", async () => {
    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Finbox",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
        "https://chat.example.com",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByLabelText(/workspace project/i)).toHaveValue("project-default");
    await screen.findByLabelText(/email/i);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(loginWorkspaceWithPassword).toHaveBeenCalledWith({
        organizationUrl: "https://chat.example.com",
        login: "user@example.com",
        password: "secret",
        projectId: "project-default",
      });
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("allows overriding prefilled Workspace project id", async () => {
    vi.stubEnv("VITE_DEFAULT_WORKSPACE_PROJECT_ID", "");

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    const projectInput = await screen.findByLabelText(/workspace project/i);
    expect(projectInput).toHaveValue("fe02e55d-4548-4b3e-a175-fcae928f41b2");

    fireEvent.change(projectInput, {
      target: { value: "project-manual" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(loginWorkspaceWithPassword).toHaveBeenCalledWith({
        organizationUrl: "https://chat.example.com",
        login: "user@example.com",
        password: "secret",
        projectId: "project-manual",
      });
    });
  });

  it("accepts login without email format", async () => {
    renderWithProviders(<LoginPage />, { route: "/login?realm=https%3A%2F%2Fchat.example.com" });

    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email or login/i);

    fireEvent.change(screen.getByLabelText(/email or login/i), {
      target: { value: "plain-login" },
    });
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(loginWorkspaceWithPassword).toHaveBeenCalledWith({
        organizationUrl: "https://chat.example.com",
        login: "plain-login",
        password: "secret",
        projectId: "project-default",
      });
    });
  });

  it("shows organization error when Workspace discovery fails", async () => {
    fetchWorkspaceServerSettingsForOrganization.mockRejectedValue(new Error("network"));

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
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByPlaceholderText("email@example.com or login");
    expect(screen.queryByRole("button", { name: "Google" })).not.toBeInTheDocument();
  });
});
