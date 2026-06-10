import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { renderWithProviders } from "~/test/render";
import { LoginPage } from "./login-page.ui";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchApiKey = vi.hoisted(() => vi.fn());
const fetchServerSettings = vi.hoisted(() => vi.fn());

const VALID_SERVER_SETTINGS = {
  realm_name: "Example Zulip",
  realm_uri: "https://chat.example.com",
  realm_url: "https://chat.example.com",
  realm_icon: "",
  external_authentication_methods: [],
};

const getPasswordStepContainer = (): HTMLElement => {
  const passwordField = screen.getByPlaceholderText("••••••••").closest("label");
  const passwordStep = passwordField?.parentElement;

  if (!(passwordStep instanceof HTMLElement)) {
    throw new Error("Password step container not found");
  }

  return passwordStep;
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/api/zulip-auth", async () => {
  const actual = await vi.importActual("~/shared/api/zulip-auth");
  return {
    ...actual,
    fetchApiKey,
    fetchServerSettings,
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    fetchServerSettings.mockResolvedValue(null);
    vi.unstubAllEnvs();
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

  it("renders only organization field on the first step", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(screen.getByPlaceholderText("https://chat.example.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("email@example.com")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("••••••••")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("enables the continue button only for a valid organization url", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });

    const continueButton = screen.getByRole("button", { name: /next/i });
    const realmInput = screen.getByLabelText(/zulip server address/i);

    expect(continueButton).toBeDisabled();

    fireEvent.change(realmInput, {
      target: { value: "workspace" },
    });
    expect(continueButton).toBeDisabled();

    fireEvent.change(realmInput, {
      target: { value: "https://chat.example.com" },
    });
    expect(continueButton).toBeEnabled();
  });

  it("fills the organization field from the default organization button", () => {
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://public.Exordos.example.com");

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.click(screen.getByRole("button", { name: /exordos core public/i }));

    expect(screen.getByLabelText(/zulip server address/i)).toHaveValue(
      "https://public.Exordos.example.com",
    );
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("uses the configured default organization name", () => {
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_URL", "https://public.example.com");
    vi.stubEnv("VITE_DEFAULT_LOGIN_ORGANIZATION_NAME", "Public Example");

    renderWithProviders(<LoginPage />, { route: "/login" });

    expect(screen.getByRole("button", { name: /public example/i })).toBeInTheDocument();
  });

  it("shows credentials only after organization settings are loaded", async () => {
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(fetchServerSettings).toHaveBeenCalledWith("https://chat.example.com");
    });

    expect(await screen.findByPlaceholderText("email@example.com")).toBeInTheDocument();
    expect(getPasswordStepContainer()).toHaveClass("hidden");
  });

  it("reveals password only after username becomes a valid email", async () => {
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const usernameInput = await screen.findByPlaceholderText("email@example.com");

    expect(getPasswordStepContainer()).toHaveClass("hidden");

    fireEvent.change(usernameInput, {
      target: { value: "ab" },
    });
    expect(getPasswordStepContainer()).toHaveClass("hidden");

    fireEvent.change(usernameInput, {
      target: { value: "user@example.com" },
    });
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(getPasswordStepContainer()).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: /^login$/i })).toBeInTheDocument();
  });

  it("auto-advances to credentials after continue was requested during organization loading", async () => {
    let resolveSettings: ((value: typeof VALID_SERVER_SETTINGS) => void) | null = null;
    fetchServerSettings.mockImplementation(
      () =>
        new Promise<typeof VALID_SERVER_SETTINGS>((resolve) => {
          resolveSettings = resolve;
        }),
    );

    renderWithProviders(<LoginPage />, { route: "/login" });

    const realmInput = screen.getByLabelText(/zulip server address/i);
    fireEvent.change(realmInput, {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.blur(realmInput);
    fireEvent.click(screen.getByRole("button", { name: /loading organization settings|next/i }));

    expect(resolveSettings).not.toBeNull();

    act(() => {
      resolveSettings?.(VALID_SERVER_SETTINGS);
    });

    expect(await screen.findByPlaceholderText("email@example.com")).toBeInTheDocument();
    expect(getPasswordStepContainer()).toHaveClass("hidden");
  });

  it("shows an organization error when server settings cannot be loaded", async () => {
    fetchServerSettings.mockResolvedValue(null);

    renderWithProviders(<LoginPage />, { route: "/login" });

    fireEvent.change(screen.getByLabelText(/zulip server address/i), {
      target: { value: "https://chat.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(fetchServerSettings).toHaveBeenCalledWith("https://chat.example.com");
    });

    expect(
      await screen.findByText(
        /could not load organization settings\. check the server address and try again\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
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
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);
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

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);
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

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);
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

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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
    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

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

  it("shows duplicate account error and does not navigate after credential login", async () => {
    useInstancesStore.getState().addInstance({
      realm: "https://chat.example.com",
      email: "user@example.com",
      apiKey: "existing-key",
    });
    fetchServerSettings.mockResolvedValue(VALID_SERVER_SETTINGS);
    fetchApiKey.mockResolvedValue({
      api_key: "key-123",
      email: "USER@example.com",
      user_id: 7,
    });

    renderWithProviders(<LoginPage />, {
      route: "/login?realm=https%3A%2F%2Fchat.example.com%2Fapi%2Fv1",
    });

    const realmInput = await screen.findByLabelText(/zulip server address/i);
    fireEvent.blur(realmInput);
    await waitFor(() => {
      expect(fetchServerSettings).toHaveBeenCalledWith("https://chat.example.com/api/v1");
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByLabelText(/email/i);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    expect(await screen.findByText(/this account has already been added/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(useInstancesStore.getState().instances).toHaveLength(1);
    expect(useInstancesStore.getState().instances[0]?.apiKey).toBe("existing-key");
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
    await screen.findByRole("button", { name: /next/i });

    expect(screen.getByTestId("realm-logo-preview")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
  });

  it("starts desktop OIDC flow and navigates to paste-token page", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchServerSettings.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
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

    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

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
      ...VALID_SERVER_SETTINGS,
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
    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(
      await screen.findByRole("button", { name: "Google" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitLab" })).toBeInTheDocument();
  });

  it("preserves redirect target when switching to desktop OIDC paste-token flow", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fetchServerSettings.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
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

    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
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
      ...VALID_SERVER_SETTINGS,
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

    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Google" }, { timeout: 4000 }));

    await waitFor(() => {
      expect(openSpy).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    openSpy.mockRestore();
  });

  it("renders fallback realm logo and omits invalid provider icons", async () => {
    fetchServerSettings.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
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

    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByRole("button", { name: "Google" }, { timeout: 4000 });

    expect(screen.getByTestId("realm-logo-preview")).toHaveAttribute(
      "src",
      expect.stringContaining("organization-fallback.svg"),
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("uses fallback realm logo and blocks same-origin icon urls before auth", async () => {
    fetchServerSettings.mockResolvedValue({
      ...VALID_SERVER_SETTINGS,
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

    await screen.findByRole("button", { name: /next/i });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
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
