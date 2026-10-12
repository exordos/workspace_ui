import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelShell as ProductionRightPanelShell } from "./right-panel-shell.ui";
import type { RightPanelAccountScreen, RightPanelProps } from "./right-panel.types";

function RightPanelShell(
  props: Readonly<Omit<RightPanelProps, "accountScreen" | "onAccountScreenChange">>,
) {
  const [accountScreen, setAccountScreen] = useState<RightPanelAccountScreen>("root");
  return (
    <>
      {accountScreen !== "root" ? (
        <button
          type="button"
          data-testid="controlled-shell-back"
          onClick={() => setAccountScreen("root")}
        >
          Back
        </button>
      ) : null}
      <ProductionRightPanelShell
        {...props}
        accountScreen={accountScreen}
        onAccountScreenChange={setAccountScreen}
      />
    </>
  );
}

const updateOwnProfileMock = vi.hoisted(() => vi.fn());
const loadOwnProfileMock = vi.hoisted(() => vi.fn());
const writeTextMock = vi.hoisted(() => vi.fn());
const avatarCapabilitiesMock = vi.hoisted(() => vi.fn());
const removeOwnAvatarMock = vi.hoisted(() => vi.fn());
const uploadOwnAvatarMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/clipboard", () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));

vi.mock("./right-panel-external-account.integration", () => ({
  RightPanelConnectExternalAccountDialog: () => null,
  RightPanelExternalAccountsList: () => null,
}));

vi.mock("~/features/manage-external-provider/manage-external-provider-entry.ui", () => ({
  ManageExternalProviderEntry: () => null,
}));

vi.mock("~/entities/user/user-workspace-status-actions.lib", () => ({
  updateWorkspaceOwnStatus: vi.fn().mockResolvedValue({ ok: true, user: null }),
}));

vi.mock("~/features/user-profile/user-profile.api", () => ({
  loadOwnProfile: (...args: unknown[]) => loadOwnProfileMock(...args),
  updateOwnProfile: (...args: unknown[]) => updateOwnProfileMock(...args),
  getOwnAvatarCapabilities: () => avatarCapabilitiesMock(),
  fetchUserProfile: vi.fn(),
  fetchOwnStatus: vi.fn(),
  removeOwnAvatar: (...args: unknown[]) => removeOwnAvatarMock(...args),
  uploadOwnAvatar: (...args: unknown[]) => uploadOwnAvatarMock(...args),
  updateOwnStatus: vi.fn(),
  clearRealmProfileFieldsCache: vi.fn(),
  fetchRealmProfileFieldDefinitions: vi.fn(),
}));

describe("RightPanelShell personal-info subview", () => {
  const workspaceUserUuid = "a225223c-637c-4afa-918f-5f2798b9305f";

  function setWorkspaceSession() {
    const session: WorkspaceAuthSession = {
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: "workspace.example.com",
      organizationOrigin: "https://workspace.example.com",
      projectId: "project-a",
      userUuid: workspaceUserUuid,
      login: "alice@example.com",
      accessToken: "access-token",
      runtimeGeneration: 1,
      profile: {
        uuid: workspaceUserUuid,
        username: "alice",
        firstName: "Alice",
        lastName: "Workspace",
        email: "alice@example.com",
        status: "active",
      },
    };
    useWorkspaceAuthStore.setState({
      currentAccountId: session.accountId,
      runtimeGeneration: 1,
      sessions: [session],
    });
    useUsersStore.getState().upsertUser({
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      displayName: "Alice Workspace",
      email: "alice@example.com",
      avatarUrl: null,
      status: "active",
      statusEmoji: "☕",
      statusText: "Focus",
      lastPingAt: "2026-07-01T10:00:00Z",
      createdAt: "2026-07-01T10:00:00Z",
      updatedAt: "2026-07-01T10:00:00Z",
    });
  }

  beforeEach(() => {
    loadOwnProfileMock.mockReset();
    loadOwnProfileMock.mockResolvedValue({
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      email: "alice@example.com",
      phone: null,
      description: "",
    });
    updateOwnProfileMock.mockReset();
    updateOwnProfileMock.mockResolvedValue({
      ok: false,
      kind: "unsupported",
      message: "unsupported",
    });
    writeTextMock.mockReset();
    writeTextMock.mockResolvedValue(true);
    avatarCapabilitiesMock.mockReset();
    avatarCapabilitiesMock.mockReturnValue({
      maxAvatarFileSizeMib: 25,
      avatarChangesDisabled: false,
    });
    removeOwnAvatarMock.mockReset();
    removeOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "urn:gravatar:0123456789abcdef0123456789abcdef",
    });
    uploadOwnAvatarMock.mockReset();
    uploadOwnAvatarMock.mockResolvedValue({
      ok: true,
      avatarUrl: "urn:image:33333333-3333-4333-8333-333333333333",
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:avatar-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    setWorkspaceSession();
  });

  afterEach(() => {
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    useUsersStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("opens personal info inside the right panel without changing the route", () => {
    renderWithProviders(
      <>
        <RightPanelShell mode="user-menu" title="Profile" />
      </>,
      { route: "/org/workspace.example.com/project/project-a/inbox" },
    );

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));

    expect(screen.getByTestId("right-panel-user-profile")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute(
      "data-own-profile",
      "true",
    );
    expect(screen.getByText("Alice Workspace")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-custom-status")).toHaveTextContent("☕ Focus");
    const presenceLabel = screen.getByTestId("right-panel-profile-presence");
    expect(presenceLabel).toHaveTextContent(t("presence.online"));
    expect(presenceLabel.className).toContain("text-call-green");
    expect(screen.getByTestId("right-panel-profile-favorites")).toHaveTextContent(
      t("common.favorites"),
    );
    expect(screen.getByTestId("right-panel-profile-edit")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("settings.personalInfo") }),
    ).not.toBeInTheDocument();
  });

  it("renders personal-info mode without nested back header (shell owns chrome)", () => {
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);

    expect(screen.getByTestId("right-panel-user-profile")).toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-user-profile-back")).not.toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-custom-status")).toHaveTextContent("☕ Focus");
  });

  it("returns to the account menu when the controlled shell goes back", () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("controlled-shell-back"));

    expect(screen.queryByTestId("right-panel-user-profile")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("settings.personalInfo") })).toBeInTheDocument();
  });

  it("edits username and name parts separately with a derived display name", async () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));

    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute("data-editing", "true");
    expect(screen.getByTestId("right-panel-profile-name-readonly")).toHaveTextContent(
      "Alice Workspace",
    );
    expect(screen.getByTestId("right-panel-profile-edit-avatar")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-avatar-edit-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-profile-name-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("right-panel-profile-edit")).not.toBeInTheDocument();
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(t("settings.profileFirstName"))).toHaveValue("Alice");
    expect(screen.getByLabelText(t("settings.profileLastName"))).toHaveValue("Workspace");
    expect(screen.getByLabelText(t("info.username"))).toHaveValue("alice");
    const detailList = screen.getByTestId("right-panel-user-profile-details");
    expect(detailList).toBeInTheDocument();
    const emailRow = screen.getByTestId("right-panel-profile-detail-email");
    expect(emailRow).toHaveTextContent("alice@example.com");
    expect(emailRow.querySelector("input")).toBeNull();
    expect(within(emailRow).getByRole("button", { name: t("message.copy") })).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-detail-userId")).toHaveTextContent(
      workspaceUserUuid,
    );
    expect(
      screen.getByTestId("right-panel-profile-detail-phone").querySelector("input"),
    ).toHaveValue("");
    expect(screen.getByTestId("right-panel-profile-detail-joined")).toBeInTheDocument();
    expect(screen.getAllByTestId("profile-display-name-preview")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(t("settings.profileFirstName")), {
      target: { value: "Alicia" },
    });
    expect(
      within(screen.getByTestId("right-panel-profile-name-readonly")).getByTestId(
        "profile-display-name-preview",
      ),
    ).toHaveTextContent("Alicia Workspace");

    // Figma 12697:37529 — label stays on one line (NO_WRAP); cancel is fixed 110px.
    const saveButton = screen.getByTestId("right-panel-profile-save");
    expect(saveButton).toHaveTextContent(t("info.saveChanges"));
    expect(saveButton).toHaveClass("whitespace-nowrap");
    const cancelButton = screen.getByTestId("right-panel-profile-cancel");
    expect(cancelButton).toHaveClass("w-[110px]", "bg-card-bg-active", "hover:opacity-90");
  });

  it("saves only changed fields and retains the draft when IAM rejects the request", async () => {
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    const firstName = await screen.findByLabelText(t("settings.profileFirstName"));
    fireEvent.change(firstName, { target: { value: "Alicia" } });
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));
    await waitFor(() =>
      expect(updateOwnProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: workspaceUserUuid }),
        { firstName: "Alicia" },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t("settings.profileUpdateUnsupported"),
    );
    expect(firstName).toHaveValue("Alicia");
    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute("data-editing", "true");
  });

  it("updates the top name from draft parts and username, then resets it on cancel", async () => {
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    expect(screen.queryByLabelText(t("settings.profileFirstName"))).not.toBeInTheDocument();
    expect(screen.queryByLabelText(t("settings.profileLastName"))).not.toBeInTheDocument();
    expect(screen.queryByLabelText(t("info.username"))).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    const firstName = await screen.findByLabelText(t("settings.profileFirstName"));
    const lastName = screen.getByLabelText(t("settings.profileLastName"));
    const username = screen.getByLabelText(t("info.username"));
    const topName = screen.getByTestId("right-panel-profile-name-readonly");
    expect(firstName).not.toBeRequired();
    expect(lastName).not.toBeRequired();
    expect(username).toBeRequired();
    fireEvent.change(lastName, { target: { value: "" } });
    expect(topName).toHaveTextContent("Alice");
    fireEvent.change(firstName, { target: { value: "   " } });
    expect(topName).toHaveTextContent("alice");
    fireEvent.change(username, { target: { value: "draft-username" } });
    expect(topName).toHaveTextContent("draft-username");
    fireEvent.change(lastName, { target: { value: "  ТолькоФамилия  " } });
    expect(topName).toHaveTextContent("ТолькоФамилия");
    fireEvent.change(firstName, { target: { value: "  НовоеИмя  " } });
    expect(topName).toHaveTextContent("НовоеИмя ТолькоФамилия");
    fireEvent.change(lastName, { target: { value: "  " } });
    expect(topName).toHaveTextContent("НовоеИмя");
    expect(screen.getAllByTestId("profile-display-name-preview")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("right-panel-profile-cancel"));
    expect(screen.getByText("Alice Workspace")).toBeInTheDocument();
    expect(screen.queryByLabelText(t("settings.profileFirstName"))).not.toBeInTheDocument();
    expect(useUsersStore.getState().usersById[workspaceUserUuid]?.displayName).toBe(
      "Alice Workspace",
    );
    expect(useWorkspaceAuthStore.getState().sessions[0]?.profile?.username).toBe("alice");
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    expect(await screen.findByLabelText(t("settings.profileFirstName"))).toHaveValue("Alice");
    expect(screen.getByLabelText(t("settings.profileLastName"))).toHaveValue("Workspace");
    expect(screen.getByLabelText(t("info.username"))).toHaveValue("alice");
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
  });

  it("keeps unsupported fields readonly and edits supported detail rows in place", async () => {
    loadOwnProfileMock.mockResolvedValueOnce({
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      email: "alice@example.com",
      phone: "+123",
      description: "Existing description",
    });
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    const detailIds = Array.from(
      screen.getByTestId("right-panel-user-profile-details").children,
    ).map((row) => row.getAttribute("data-testid"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    const phone = await screen.findByLabelText(t("info.phone"));
    expect(phone).toHaveValue("+123");
    expect(screen.getByLabelText(t("settings.profileDescription"))).toHaveValue(
      "Existing description",
    );
    for (const testId of detailIds) {
      if (testId != null) expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const emailRow = screen.getByTestId("right-panel-profile-detail-email");
    expect(emailRow.querySelector("input")).toBeNull();
    fireEvent.click(within(emailRow).getByRole("button", { name: t("message.copy") }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("alice@example.com"));
    fireEvent.change(phone, { target: { value: "+456" } });
    fireEvent.change(screen.getByLabelText(t("settings.profileDescription")), {
      target: { value: "Updated description" },
    });
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));
    await waitFor(() =>
      expect(updateOwnProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: workspaceUserUuid }),
        { phone: "+456", description: "Updated description" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("does not show or copy the old phone after a successful clear", async () => {
    const ownProfile = {
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      email: "alice@example.com",
      phone: "+123",
      description: "",
    };
    loadOwnProfileMock.mockResolvedValueOnce(ownProfile);
    updateOwnProfileMock.mockResolvedValueOnce({
      ok: true,
      refreshPending: false,
      profile: { ...ownProfile, phone: "" },
    });
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    await waitFor(() =>
      expect(screen.getByTestId("right-panel-profile-detail-phone")).toHaveTextContent("+123"),
    );
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.change(screen.getByLabelText(t("info.phone")), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));
    await waitFor(() =>
      expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute(
        "data-editing",
        "false",
      ),
    );
    expect(updateOwnProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ userUuid: workspaceUserUuid }),
      { phone: "" },
      expect.any(AbortSignal),
    );
    const phoneRow = screen.getByTestId("right-panel-profile-detail-phone");
    expect(phoneRow).not.toHaveTextContent("+123");
    expect(within(phoneRow).getByText("-")).toBeInTheDocument();
    expect(phoneRow.querySelector("button")).toBeNull();
    expect(phoneRow.querySelector("input")).toBeNull();
  });

  it("requires a valid IAM username while keeping both names optional", async () => {
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    const firstName = await screen.findByLabelText(t("settings.profileFirstName"));
    const lastName = screen.getByLabelText(t("settings.profileLastName"));
    const username = screen.getByLabelText(t("info.username"));
    const save = screen.getByTestId("right-panel-profile-save");
    fireEvent.change(firstName, { target: { value: "" } });
    fireEvent.change(lastName, { target: { value: "" } });
    expect(save).not.toBeDisabled();
    for (const value of ["", "   ", "invalid@name", "😀", "x".repeat(129)]) {
      fireEvent.change(username, { target: { value } });
      expect(save).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(t("settings.profileInvalidFields"));
    }
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(t("settings.profileUsernameInvalid"))).toBeInTheDocument();
    fireEvent.change(username, { target: { value: "  Имя_１２3.name-!+  " } });
    expect(save).not.toBeDisabled();
    expect(username).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(t("settings.profileUsernameHint"))).toBeInTheDocument();
    fireEvent.change(firstName, { target: { value: "x".repeat(129) } });
    expect(save).toBeDisabled();
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
  });

  it("retries only the avatar after profile fields were saved successfully", async () => {
    updateOwnProfileMock.mockResolvedValue({
      ok: true,
      refreshPending: false,
      profile: {
        uuid: workspaceUserUuid,
        username: "alice",
        firstName: "Alicia",
        lastName: "Workspace",
        email: "alice@example.com",
        phone: null,
        description: "",
      },
    });
    uploadOwnAvatarMock.mockResolvedValueOnce({
      ok: false,
      kind: "transient",
      message: "Unavailable",
    });
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.change(await screen.findByLabelText(t("settings.profileFirstName")), {
      target: { value: "Alicia" },
    });
    fireEvent.change(screen.getByTestId("right-panel-edit-avatar-gallery-input"), {
      target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));
    expect(await screen.findByTestId("right-panel-edit-avatar-error")).toHaveTextContent(
      t("settings.avatarUpdateError"),
    );
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-cancel"));
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));
    await waitFor(() =>
      expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute(
        "data-editing",
        "false",
      ),
    );
    expect(updateOwnProfileMock).toHaveBeenCalledTimes(1);
    expect(uploadOwnAvatarMock).toHaveBeenCalledTimes(2);
  });

  it("opens edit-avatar modal from the clickable avatar in edit mode", () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit-avatar"));

    expect(screen.getByTestId("right-panel-edit-avatar-dialog")).toBeInTheDocument();
    // Keep the camera action hidden until taking photos is supported.
    expect(screen.queryByTestId("right-panel-edit-avatar-take-photo")).not.toBeInTheDocument();
    expect(screen.getByTestId("right-panel-edit-avatar-choose-gallery")).toHaveTextContent(
      t("settings.chooseFromGallery"),
    );
    expect(screen.getByTestId("right-panel-edit-avatar-remove")).toHaveTextContent(
      t("settings.removeCurrentPhoto"),
    );
  });

  it("shows avatar-disabled error when removing photo while changes are disabled", () => {
    avatarCapabilitiesMock.mockReturnValue({
      maxAvatarFileSizeMib: 25,
      avatarChangesDisabled: true,
    });
    useUsersStore.getState().upsertUser({
      uuid: workspaceUserUuid,
      username: "alice",
      firstName: "Alice",
      lastName: "Workspace",
      displayName: "Alice Workspace",
      email: "alice@example.com",
      avatarUrl: "https://cdn.example.com/alice.png",
      status: "active",
      statusEmoji: "☕",
      statusText: "Focus",
      lastPingAt: "2026-07-01T10:00:00Z",
      createdAt: "2026-07-01T10:00:00Z",
      updatedAt: "2026-07-01T10:00:00Z",
    });

    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit-avatar"));
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-remove"));

    expect(screen.getByTestId("right-panel-edit-avatar-error")).toHaveTextContent(
      t("settings.avatarChangesDisabled"),
    );
  });

  it("previews a selected avatar and uploads it only after save", async () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit-avatar"));
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-choose-gallery"));

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("right-panel-edit-avatar-gallery-input"), {
      target: { files: [file] },
    });

    const editAvatar = screen.getByTestId("right-panel-profile-edit-avatar");
    expect(editAvatar.querySelector("img")).toHaveAttribute("src", "blob:avatar-preview");
    expect(uploadOwnAvatarMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("right-panel-edit-avatar-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("right-panel-profile-save"));

    await waitFor(() => {
      expect(uploadOwnAvatarMock).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: workspaceUserUuid }),
        file,
        expect.any(AbortSignal),
      );
      expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute(
        "data-editing",
        "false",
      );
    });
  });

  it("resets the current avatar only after save", async () => {
    const existingUser = useUsersStore.getState().usersById[workspaceUserUuid];
    if (existingUser == null) {
      throw new Error("Expected current Workspace user");
    }
    useUsersStore.getState().upsertUser({
      ...existingUser,
      avatarUrl: "urn:image:33333333-3333-4333-8333-333333333333",
      updatedAt: "2026-07-01T10:01:00Z",
    });
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit-avatar"));
    fireEvent.click(screen.getByTestId("right-panel-edit-avatar-remove"));

    await waitFor(() => {
      expect(
        screen.getByTestId("right-panel-profile-edit-avatar").querySelector("img"),
      ).toHaveAttribute(
        "src",
        "https://secure.gravatar.com/avatar/c160f8cc69a4f0bf2b0362752353d060?d=identicon&s=500",
      );
    });
    expect(removeOwnAvatarMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("right-panel-edit-avatar-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("right-panel-profile-save"));

    await waitFor(() => {
      expect(removeOwnAvatarMock).toHaveBeenCalledWith(
        expect.objectContaining({ userUuid: workspaceUserUuid }),
        expect.any(AbortSignal),
      );
      expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute(
        "data-editing",
        "false",
      );
    });
  });

  it("discards the selected avatar when profile editing is cancelled", async () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit-avatar"));

    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("right-panel-edit-avatar-gallery-input"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId("right-panel-profile-cancel"));

    expect(uploadOwnAvatarMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute("data-editing", "false");
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar-preview");
    });
  });

  it("exits edit chrome from cancel and save without calling profile update API", () => {
    renderWithProviders(<RightPanelShell mode="user-menu" title="Profile" />);

    fireEvent.click(screen.getByRole("button", { name: t("settings.personalInfo") }));
    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-cancel"));

    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute("data-editing", "false");
    expect(screen.getByTestId("right-panel-profile-edit")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("right-panel-profile-edit"));
    fireEvent.click(screen.getByTestId("right-panel-profile-save"));

    expect(screen.getByTestId("right-panel-user-profile")).toHaveAttribute("data-editing", "false");
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
  });

  it("shows check feedback on share without a bottom toast", async () => {
    renderWithProviders(<RightPanelShell mode="personal-info" title="Profile" />);

    const share = screen.getByTestId("right-panel-profile-share");
    expect(share).toHaveTextContent(t("info.share"));
    expect(share).toHaveAttribute("data-copy-state", "idle");

    fireEvent.click(share);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        `https://workspace.example.com/#user/${workspaceUserUuid}`,
      );
      expect(share).toHaveAttribute("data-copy-state", "success");
      expect(share).toHaveTextContent(t("message.copied"));
    });
    expect(screen.queryByTestId("right-panel-profile-share-toast")).not.toBeInTheDocument();
  });
});
