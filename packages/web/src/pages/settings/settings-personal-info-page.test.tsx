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
const getOwnAvatarCapabilitiesMock = vi.hoisted(() => vi.fn());
const uploadOwnAvatarMock = vi.hoisted(() => vi.fn());
const removeOwnAvatarMock = vi.hoisted(() => vi.fn());
const getRealmBaseUrlMock = vi.hoisted(() => vi.fn());
const createObjectURLMock = vi.hoisted(() => vi.fn());
const revokeObjectURLMock = vi.hoisted(() => vi.fn());
const bumpAvatarVersionMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/user-profile/user-profile.api", () => ({
  fetchUserProfile: fetchUserProfileMock,
  updateOwnProfile: updateOwnProfileMock,
  getOwnAvatarCapabilities: getOwnAvatarCapabilitiesMock,
  uploadOwnAvatar: uploadOwnAvatarMock,
  removeOwnAvatar: removeOwnAvatarMock,
}));

vi.mock("~/entities/user/api/user.api", () => ({
  fetchOwnStatus: (...args: unknown[]) => fetchOwnStatusMock(...args),
  updateOwnStatus: (...args: unknown[]) => updateOwnStatusMock(...args),
}));

vi.mock("~/shared/api/zulip-client.internal", () => ({
  getRealmBaseUrl: getRealmBaseUrlMock,
}));

vi.mock("~/shared/lib/avatar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/shared/lib/avatar")>();
  return {
    ...actual,
    bumpAvatarVersion: bumpAvatarVersionMock,
  };
});

function createPngFile(name = "avatar.png"): File {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  return new File([bytes], name, { type: "image/png" });
}

describe("SettingsPersonalInfoPage", () => {
  beforeEach(() => {
    fetchUserProfileMock.mockReset();
    fetchUserProfileMock.mockResolvedValue(null);
    updateOwnProfileMock.mockReset();
    updateOwnProfileMock.mockResolvedValue({ ok: false, kind: "transient", message: "error" });
    fetchOwnStatusMock.mockReset();
    fetchOwnStatusMock.mockResolvedValue(null);
    updateOwnStatusMock.mockReset();
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });
    getOwnAvatarCapabilitiesMock.mockReset();
    getOwnAvatarCapabilitiesMock.mockReturnValue({
      maxAvatarFileSizeMib: 25,
      avatarChangesDisabled: false,
    });
    uploadOwnAvatarMock.mockReset();
    uploadOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "/avatar/new.png",
    });
    removeOwnAvatarMock.mockReset();
    removeOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "/avatar/default.png",
    });
    getRealmBaseUrlMock.mockReset();
    getRealmBaseUrlMock.mockReturnValue("https://zulip.example.com");
    createObjectURLMock.mockReset();
    revokeObjectURLMock.mockReset();
    bumpAvatarVersionMock.mockReset();
    createObjectURLMock.mockImplementation(() => "blob:avatar-preview");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
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
    updateOwnProfileMock.mockResolvedValue({ ok: true });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    const fullNameInput = screen.getByRole("textbox", { name: /full name/i });
    fireEvent.change(fullNameInput, { target: { value: "Alice Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnProfileMock).toHaveBeenCalledWith({
        fullName: "Alice Updated",
        timezone: "Europe/Moscow",
      });
    });
    expect(updateOwnStatusMock).toHaveBeenCalledWith({
      text: "",
      emojiName: undefined,
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
      text: "Heads down",
      emojiName: "speech_balloon",
      emojiCode: "1f4ac",
      reactionType: "unicode_emoji",
      away: false,
    });
    updateOwnProfileMock.mockResolvedValue({ ok: true });
    updateOwnStatusMock.mockResolvedValue({
      ok: true,
      status: {
        text: "Reviewing PRs",
        emojiName: "speech_balloon",
        emojiCode: "1f4ac",
        reactionType: "unicode_emoji",
        away: true,
      },
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    const statusInput = screen.getByRole("textbox", { name: /status/i });
    fireEvent.change(statusInput, { target: { value: "Reviewing PRs" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /away/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "Reviewing PRs",
        emojiName: "speech_balloon",
        away: true,
      });
    });
    expect(screen.getAllByText(/Reviewing PRs/).length).toBeGreaterThan(0);
    expect(useUsersStore.getState().getUser(42)?.status).toEqual({
      text: "Reviewing PRs",
      emojiName: "speech_balloon",
      emojiCode: "1f4ac",
      reactionType: "unicode_emoji",
      away: true,
    });
  });

  it("keeps existing status and edit mode when clear request fails", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      status: {
        text: "Heads down",
        away: false,
      },
      statusFetchedAt: Date.now(),
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
      text: "Heads down",
      away: false,
    });
    updateOwnProfileMock.mockResolvedValue({ ok: true });
    updateOwnStatusMock.mockResolvedValue({
      ok: false,
      status: 503,
      kind: "transient",
      message: "Server error",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    const statusInput = screen.getByRole("textbox", { name: /status/i });
    fireEvent.change(statusInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "",
        emojiName: undefined,
        away: false,
      });
    });
    expect(screen.getByText(/failed to update profile/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(useUsersStore.getState().getUser(42)?.status).toEqual({
      text: "Heads down",
      away: false,
    });
  });

  it("shows timezone input only in edit mode", async () => {
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
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    expect(screen.queryByRole("combobox", { name: /^timezone$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    expect(screen.getByRole("combobox", { name: /^timezone$/i })).toBeInTheDocument();
  });

  it("keeps timezone draft local until save and applies it on save", async () => {
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
    });
    updateOwnProfileMock.mockResolvedValue({ ok: true });
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const timezoneInput = screen.getByRole("combobox", { name: /^timezone$/i });
    fireEvent.change(timezoneInput, { target: { value: "Europe/Berlin" } });
    expect(updateOwnProfileMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(updateOwnProfileMock).toHaveBeenCalledWith({
        fullName: "Alice Doe",
        timezone: "Europe/Berlin",
      });
    });
    expect(screen.getByText("Europe/Berlin")).toBeInTheDocument();
  });

  it("cancels timezone draft without API calls", async () => {
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
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const timezoneInput = screen.getByRole("combobox", { name: /^timezone$/i });
    fireEvent.change(timezoneInput, { target: { value: "Europe/Berlin" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(updateOwnStatusMock).not.toHaveBeenCalled();
    expect(screen.getByText("Europe/Moscow")).toBeInTheDocument();
  });

  it("shows timezone validation error for invalid value and does not save", async () => {
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
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const timezoneInput = screen.getByRole("combobox", { name: /^timezone$/i });
    fireEvent.change(timezoneInput, { target: { value: "Mars/Olympus_Mons" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(screen.getByText(/valid iana timezone/i)).toBeInTheDocument();
  });

  it("shows timezone unsupported error from profile save", async () => {
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
    });
    updateOwnProfileMock.mockResolvedValue({
      ok: false,
      kind: "unsupported",
      message: "Timezone is unsupported",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOwnProfileMock).toHaveBeenCalled();
    });
    expect(
      screen.getByText(/timezone update is not supported by this server/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("hides avatar actions outside edit mode", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    expect(screen.queryByRole("button", { name: /change avatar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove avatar/i })).not.toBeInTheDocument();
  });

  it("shows avatar actions in edit mode", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    expect(screen.getByRole("button", { name: /change avatar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove avatar/i })).toBeInTheDocument();
  });

  it("keeps avatar upload pending until save and shows local preview", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    uploadOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "/avatar/new.png",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = createPngFile();
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledWith(file);
    });
    expect(uploadOwnAvatarMock).not.toHaveBeenCalled();
    await waitFor(() => {
      const avatarImage = document.querySelector("img");
      expect(avatarImage?.getAttribute("src")).toContain("blob:avatar-preview");
    });
  });

  it("resolves relative avatar URL using realm base", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/fallback.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));

    await waitFor(() => {
      const avatarImage = document.querySelector("img");
      expect(avatarImage).not.toBeNull();
      expect(avatarImage?.getAttribute("src")).toContain(
        "https://zulip.example.com/avatar/old.png",
      );
      expect(avatarImage?.getAttribute("src")).toContain("_av=");
    });
  });

  it("keeps avatar remove pending until save", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    removeOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "/avatar/default.png",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    fireEvent.click(screen.getByRole("button", { name: /remove avatar/i }));

    expect(removeOwnAvatarMock).not.toHaveBeenCalled();
  });

  it("rolls back pending avatar changes on cancel", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = createPngFile();
    fireEvent.change(fileInput!, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(uploadOwnAvatarMock).not.toHaveBeenCalled();
    expect(removeOwnAvatarMock).not.toHaveBeenCalled();
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(updateOwnStatusMock).not.toHaveBeenCalled();
    const avatarImage = document.querySelector("img");
    expect(avatarImage?.getAttribute("src")).toContain("https://zulip.example.com/avatar/old.png");
  });

  it("applies pending avatar upload on save before profile/status", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    let resolveUpload: ((value: { ok: true; avatarUrl: string }) => void) | undefined;
    uploadOwnAvatarMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    updateOwnProfileMock.mockResolvedValue({ ok: true });
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = createPngFile();
    fireEvent.change(fileInput!, { target: { files: [file] } });
    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledWith(file);
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(useUsersStore.getState().getUser(42)?.avatar_url).toBe("blob:avatar-preview");
    });
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(updateOwnStatusMock).not.toHaveBeenCalled();
    if (resolveUpload == null) {
      throw new Error("Expected upload resolver to be set");
    }
    resolveUpload({ ok: true, avatarUrl: "/avatar/new.png" });

    await waitFor(() => {
      expect(uploadOwnAvatarMock).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      expect(updateOwnProfileMock).toHaveBeenCalledWith({
        fullName: "Alice Doe",
        timezone: "Europe/Moscow",
      });
      expect(updateOwnStatusMock).toHaveBeenCalledWith({
        text: "",
        emojiName: undefined,
        away: false,
      });
    });
    expect(bumpAvatarVersionMock).toHaveBeenCalledTimes(1);
    const uploadCallOrder = uploadOwnAvatarMock.mock.invocationCallOrder[0];
    const profileCallOrder = updateOwnProfileMock.mock.invocationCallOrder[0];
    expect(uploadCallOrder).toBeDefined();
    expect(profileCallOrder).toBeDefined();
    expect(uploadCallOrder!).toBeLessThan(profileCallOrder!);
    expect(useUsersStore.getState().getUser(42)?.avatar_url).toBe("/avatar/new.png");
  });

  it("applies pending avatar remove on save", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    updateOwnProfileMock.mockResolvedValue({ ok: true });
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove avatar/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(removeOwnAvatarMock).toHaveBeenCalled();
    });
    expect(bumpAvatarVersionMock).toHaveBeenCalledTimes(1);
    expect(useUsersStore.getState().getUser(42)?.avatar_url).toBe("/avatar/default.png");
  });

  it("keeps edit mode and skips profile save when avatar mutation fails", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    uploadOwnAvatarMock.mockResolvedValue({
      ok: false,
      kind: "unsupported",
      message: "Not found",
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = createPngFile();
    fireEvent.change(fileInput!, { target: { files: [file] } });
    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledWith(file);
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(uploadOwnAvatarMock).toHaveBeenCalledWith(file);
    });
    expect(useUsersStore.getState().getUser(42)?.avatar_url).toBe("/avatar/old.png");
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(updateOwnStatusMock).not.toHaveBeenCalled();
    expect(screen.getByText(/avatar update is not supported by this server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("keeps committed avatar when profile save fails after avatar success", async () => {
    useChatListStore.setState({ currentUserId: 42 });
    useUsersStore.getState().mergeUser({
      user_id: 42,
      full_name: "Alice Doe",
      email: "alice@example.com",
      avatar_url: "/avatar/old.png",
    });
    fetchUserProfileMock.mockResolvedValue({
      userId: 42,
      fullName: "Alice Doe",
      email: "alice@example.com",
      avatarUrl: "/avatar/old.png",
      role: 400,
      timezone: "Europe/Moscow",
    });
    uploadOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "/avatar/new.png",
    });
    updateOwnProfileMock.mockResolvedValue({
      ok: false,
      kind: "transient",
      message: "Failed to update profile",
    });
    updateOwnStatusMock.mockResolvedValue({ ok: true, status: null });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = createPngFile();
    fireEvent.change(fileInput!, { target: { files: [file] } });
    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledWith(file);
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(uploadOwnAvatarMock).toHaveBeenCalledWith(file);
    });
    expect(useUsersStore.getState().getUser(42)?.avatar_url).toBe("/avatar/new.png");
    expect(screen.getByText(/failed to update profile/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("disables avatar controls when avatar changes are forbidden by capabilities", async () => {
    getOwnAvatarCapabilitiesMock.mockReturnValue({
      maxAvatarFileSizeMib: 25,
      avatarChangesDisabled: true,
    });
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
    });

    renderWithProviders(<SettingsPersonalInfoPage />);
    await waitFor(() => expect(fetchUserProfileMock).toHaveBeenCalledWith(42));
    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));

    expect(screen.getByRole("button", { name: /change avatar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove avatar/i })).toBeDisabled();
  });
});
