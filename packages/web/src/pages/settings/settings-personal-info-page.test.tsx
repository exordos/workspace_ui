import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { SettingsPersonalInfoPage } from "./settings-personal-info-page.ui";

const fetchUserProfileMock = vi.hoisted(() => vi.fn());
const updateOwnProfileMock = vi.hoisted(() => vi.fn());
const fetchOwnStatusMock = vi.hoisted(() => vi.fn());
const updateOwnStatusMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/user-profile/user-profile.api", () => ({
  fetchUserProfile: fetchUserProfileMock,
  updateOwnProfile: updateOwnProfileMock,
  fetchOwnStatus: fetchOwnStatusMock,
  updateOwnStatus: updateOwnStatusMock,
}));

describe("SettingsPersonalInfoPage", () => {
  beforeEach(() => {
    fetchUserProfileMock.mockReset();
    fetchUserProfileMock.mockResolvedValue(null);
    updateOwnProfileMock.mockReset();
    updateOwnProfileMock.mockResolvedValue(false);
    fetchOwnStatusMock.mockReset();
    fetchOwnStatusMock.mockResolvedValue(null);
    updateOwnStatusMock.mockReset();
    updateOwnStatusMock.mockResolvedValue(true);
  });

  afterEach(() => {
    useChatListStore.getState().clear();
    useUsersStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
    });
    act(() => {
      setLocale("en");
    });
  });

  it("shows current user profile details", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "",
      role: 400,
      timezone: "Europe/Moscow",
      phone: "+7 999 123-45-67",
      birthday: "1990-01-01",
      jobTitle: "Senior Engineer",
      manager: "Bob Manager",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    expect((await screen.findAllByText("Alice Doe")).length).toBeGreaterThan(0);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Europe/Moscow")).toBeInTheDocument();
    expect(screen.getByText("+7 999 123-45-67")).toBeInTheDocument();
    expect(screen.getByText("1990-01-01")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    expect(screen.getByText("Bob Manager")).toBeInTheDocument();

    expect(fetchUserProfileMock).toHaveBeenCalledWith(42);
  });

  it("renders personal info in the same profile metadata format as user profile panel", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "",
      role: 200,
      isBot: false,
      isActive: true,
      dateJoined: "2025-01-10T15:00:00.000Z",
      localTime: "17:30",
      timezone: "Europe/Moscow",
      phone: undefined,
      birthday: undefined,
      jobTitle: undefined,
      manager: undefined,
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    expect(screen.getByText(/information/i)).toBeInTheDocument();
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    expect(screen.getByText(/^human$/i)).toBeInTheDocument();
    expect(screen.getByText(/^active$/i)).toBeInTheDocument();
    expect(screen.getByText("17:30")).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
  });

  it("renders fallback placeholders when user is unavailable", () => {
    renderWithProviders(<SettingsPersonalInfoPage />);

    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("copies profile link using current instance realm", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://zulip.example.com",
          email: "alice@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /share profile/i }));

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith("https://zulip.example.com/#user/42"),
    );
    expect(screen.getByText(/profile link copied/i)).toBeInTheDocument();
  });

  it("disables share profile action when instance realm is invalid", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });

    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "http://zulip.example.com",
          email: "alice@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    const shareButton = screen.getByRole("button", { name: /share profile/i });
    expect(shareButton).toBeDisabled();
    fireEvent.click(shareButton);

    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("allows editing own full name and saving profile changes", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "",
      role: 400,
      timezone: "Europe/Moscow",
      phone: undefined,
      birthday: undefined,
      jobTitle: undefined,
      manager: undefined,
    });
    updateOwnProfileMock.mockResolvedValue(true);

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    const fullNameInput = screen.getByRole("textbox", { name: /full name/i });
    fireEvent.change(fullNameInput, { target: { value: "Alice Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnProfileMock).toHaveBeenCalledWith({ fullName: "Alice Updated" });
    });
    expect(updateOwnStatusMock).toHaveBeenCalledWith({
      statusText: "",
      away: false,
    });
    await waitFor(() => {
      expect(screen.getAllByText("Alice Updated").length).toBeGreaterThan(0);
    });
    expect(useUsersStore.getState().getUser(42)?.full_name).toBe("Alice Updated");
  });

  it("allows editing own status and away flag in personal profile", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "",
      role: 400,
      timezone: "Europe/Moscow",
      phone: undefined,
      birthday: undefined,
      jobTitle: undefined,
      manager: undefined,
    });
    fetchOwnStatusMock.mockResolvedValue({
      statusText: "Heads down",
      away: false,
    });
    updateOwnProfileMock.mockResolvedValue(true);
    updateOwnStatusMock.mockResolvedValue(true);

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    const statusInput = screen.getByRole("textbox", { name: /status/i });
    fireEvent.change(statusInput, { target: { value: "Reviewing PRs" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /away/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        statusText: "Reviewing PRs",
        away: true,
      });
    });
    expect(screen.getAllByText(/Reviewing PRs/).length).toBeGreaterThan(0);
  });
});
