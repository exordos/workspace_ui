import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { renderWithProviders } from "~/test/render";
import { LoginPage } from "./login-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchApiKey = vi.hoisted(() => vi.fn());
const fetchServerSettings = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/api/zulip-auth", async () => {
  const actual =
    await vi.importActual<typeof import("~/shared/api/zulip-auth")>("~/shared/api/zulip-auth");
  return {
    ...actual,
    fetchApiKey,
    fetchServerSettings,
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    fetchServerSettings.mockResolvedValue(null);
  });

  afterEach(() => {
    useInstancesStore.setState({ instances: [], currentInstanceId: null });
    localStorage.removeItem("zulip-web-instances");
    localStorage.removeItem("zulip-web-current-instance");
    navigateSpy.mockReset();
    fetchApiKey.mockReset();
    fetchServerSettings.mockReset();
  });

  it("prefills the realm field from the URL query", () => {
    useInstancesStore.setState({ instances: [], currentInstanceId: null });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    return waitFor(() => {
      expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
        "https://chat.example.com",
      );
    });
  });

  it("renders localized input placeholders", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(screen.getByPlaceholderText("https://chat.example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("email@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("requests server settings only after realm input blur", async () => {
    fetchServerSettings.mockResolvedValue(null);

    renderWithProviders(<LoginPage />, { route: "/login" });

    const realmInput = screen.getByLabelText(/zulip server address/i);
    fireEvent.change(realmInput, {
      target: { value: "https://sys.pla" },
    });

    expect(fetchServerSettings).not.toHaveBeenCalled();

    fireEvent.blur(realmInput);

    await waitFor(() => {
      expect(fetchServerSettings).toHaveBeenCalledWith("https://sys.pla");
    });
  });

  it("navigates to redirectTo after a successful login", async () => {
    fetchServerSettings.mockResolvedValue(null);
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route:
        "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Fmessage%2F123%3Frealm%3Dhttps%253A%252F%252Fchat.example.com",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
        "https://chat.example.com",
      );
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "/message/123?realm=https%3A%2F%2Fchat.example.com",
        { replace: true },
      );
    });
  });

  it("ignores external redirectTo values and falls back to root", async () => {
    fetchServerSettings.mockResolvedValue(null);
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route:
        "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=https%3A%2F%2Fevil.example%2Fphish",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
        "https://chat.example.com",
      );
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("uses the current /message path as an implicit redirect target", async () => {
    fetchServerSettings.mockResolvedValue(null);
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route: "/message/123?realm=https%3A%2F%2Fchat.example.com",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
        "https://chat.example.com",
      );
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "/message/123?realm=https%3A%2F%2Fchat.example.com",
        { replace: true },
      );
    });
  });

  it("stores realm icon in instance data after successful login", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "https://cdn.example.com/realm-logo.svg",
      external_authentication_methods: [],
    });
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);

    await waitFor(() => {
      expect(screen.getByText("Example Zulip")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
    expect(useInstancesStore.getState().instances[0]?.realmIcon).toBe(
      "https://cdn.example.com/realm-logo.svg",
    );
  });

  it("stores raw relative realm_icon path for post-login logo resolution", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "/user_avatars/1/realm/icon.png",
      external_authentication_methods: [],
    });
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);

    await waitFor(() => {
      expect(screen.getByText("Example Zulip")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
    expect(useInstancesStore.getState().instances[0]?.realmIcon).toBe(
      "/user_avatars/1/realm/icon.png",
    );
  });

  it("stores canonical realm from server_settings when logging in", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Canonical Org",
      realm_uri: "https://canonical.example.com",
      realm_url: "https://canonical.example.com",
      realm_icon: "",
      external_authentication_methods: [],
    });
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "user@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fgw.example.com",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);

    await waitFor(() => {
      expect(screen.getByText("Canonical Org")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
    expect(useInstancesStore.getState().instances[0]?.realm).toBe("https://canonical.example.com");
    expect(useInstancesStore.getState().instances[0]?.workspaceOrgOrigin).toBe(
      "https://gw.example.com",
    );
  });

  it("shows fallback organization logo when realm icon is absent", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "",
      external_authentication_methods: [],
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);

    await waitFor(() => {
      expect(screen.getByText("Example Zulip")).toBeInTheDocument();
    });

    expect(screen.getByTestId("realm-logo-preview")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
  });

  it("starts desktop OIDC flow and navigates to paste-token page", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          login_url: "/accounts/login/google/",
        },
      ],
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    const button = await screen.findByRole("button", { name: "Google" }, { timeout: 4000 });
    fireEvent.click(button);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
      const openedUrl = String(openSpy.mock.calls[0]?.[0] ?? "");
      expect(openedUrl).toContain("desktop_flow_otp=");
      expect(openedUrl).toContain("next=%2F");
    });
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/paste-token?realm=https%3A%2F%2Fchat.example.com");
    });

    openSpy.mockRestore();
  });

  it("renders multiple external auth providers from server settings", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          login_url: "/accounts/login/google/",
        },
        {
          name: "github",
          display_name: "GitHub",
          login_url: "/accounts/login/social/github",
        },
        {
          name: "gitlab",
          display_name: "GitLab",
          login_url: "/accounts/login/social/gitlab",
        },
      ],
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);

    expect(
      await screen.findByRole("button", { name: "Google" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitLab" })).toBeInTheDocument();
  });

  it("preserves redirect target when switching to desktop OIDC paste-token flow", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          login_url: "/accounts/login/google/",
        },
      ],
    });

    renderWithProviders(<LoginPage />, {
      route:
        "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Fmessage%2F123%3Frealm%3Dhttps%253A%252F%252Fchat.example.com",
    });

    fireEvent.click(await screen.findByRole("button", { name: "Google" }, { timeout: 4000 }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "/paste-token?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Fmessage%2F123%3Frealm%3Dhttps%253A%252F%252Fchat.example.com",
      );
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    openSpy.mockRestore();
  });

  it("blocks cross-origin desktop OIDC login urls", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          login_url: "https://evil.example.com/accounts/login/google/",
        },
      ],
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    fireEvent.click(await screen.findByRole("button", { name: "Google" }, { timeout: 4000 }));

    await waitFor(() => {
      expect(openSpy).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(screen.getByText(/login failed/i)).toBeInTheDocument();
    });

    openSpy.mockRestore();
  });

  it("renders fallback realm logo and omits invalid provider icons", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "mailto:icons@example.com",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          display_icon: "file:///tmp/icon.svg",
          login_url: "/accounts/login/google/",
        },
      ],
    });

    const { container } = renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    await screen.findByRole("button", { name: "Google" }, { timeout: 4000 });

    expect(screen.getByTestId("realm-logo-preview")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("uses fallback realm logo and blocks same-origin icon urls before auth", async () => {
    fetchServerSettings.mockResolvedValue({
      realm_name: "Example Zulip",
      realm_uri: "",
      realm_url: "",
      realm_icon: "/user_avatars/1/realm/icon.png",
      external_authentication_methods: [
        {
          name: "google",
          display_name: "Google",
          display_icon: "/user_uploads/1/provider/google.png",
          login_url: "/accounts/login/google/",
        },
      ],
    });

    const { container } = renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com",
    });

    await screen.findByRole("button", { name: "Google" }, { timeout: 4000 });

    const fallbackLogo = screen.getByTestId("realm-logo-preview");
    expect(fallbackLogo).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(fallbackLogo.getAttribute("src")).not.toContain("/user_avatars/");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});
