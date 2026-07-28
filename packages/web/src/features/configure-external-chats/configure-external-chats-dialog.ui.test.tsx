import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { renderWithProviders } from "~/test/render";
import { ConfigureExternalChatsDialog } from "./configure-external-chats-dialog.ui";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

vi.mock("./configure-external-chats.hook", () => ({
  useConfigureExternalChats: vi.fn(),
}));

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "workspace-account",
  instanceId: "instance-1",
  organizationId: "organization-1",
  projectId: "project-1",
  userUuid: "user-1",
  organizationOrigin: "https://workspace.example.com",
  accessToken: "access-token",
  runtimeGeneration: 1,
};

const account: ExternalAccount = {
  uuid: "external-account-1",
  provider: "zulip",
  settings: {
    kind: "zulip",
    serverUrl: "https://zulip.example.com",
    email: "user@example.com",
    selectionMode: "explicit",
    historyDepth: "30_days",
    defaultProjectId: "project-1",
  },
  credentialPresent: true,
  status: "backfill",
  liveReady: false,
  capabilities: {},
  safeError: null,
  desiredGeneration: 1,
  appliedGeneration: 1,
  lastProgressAt: null,
  revision: 1,
  etag: '"1"',
  createdAt: "2026-07-23T10:00:00Z",
  updatedAt: "2026-07-23T10:00:00Z",
};

function viewModel(
  overrides: Partial<ReturnType<typeof useConfigureExternalChats>> = {},
): ReturnType<typeof useConfigureExternalChats> {
  return {
    chats: [],
    loadStatus: "ready",
    loadError: null,
    query: "",
    pending: new Set(),
    failed: new Set(),
    submitting: false,
    historyDepth: "30_days",
    historyDepthDirty: false,
    selectionMode: "explicit",
    selectionModeDirty: false,
    settingsDirty: false,
    saveStatus: "clean",
    settingsBusy: false,
    selectionBlockedBySettings: false,
    canSaveSettings: false,
    manualSelectionEnabled: true,
    selectableVisibleCount: 0,
    selectAllState: "none",
    readyCount: 0,
    selectedCount: 0,
    setQuery: vi.fn(),
    toggle: vi.fn(),
    toggleAllVisible: vi.fn(),
    changeHistoryDepth: vi.fn(),
    changeSelectionMode: vi.fn(),
    saveSettings: vi.fn(),
    reloadAccountSettings: vi.fn(),
    start: vi.fn(),
    retryFailed: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

function chat(
  overrides: Partial<ReturnType<typeof viewModel>["chats"][number]> = {},
): ReturnType<typeof viewModel>["chats"][number] {
  return {
    uuid: "chat-a",
    externalAccountUuid: account.uuid,
    type: "channel",
    displayName: "Support",
    selected: false,
    projectId: null,
    projectionStreamUuid: null,
    status: "available",
    safeError: null,
    transitionPending: false,
    revision: 1,
    updatedAt: "2026-07-23T10:00:00Z",
    ...overrides,
  };
}

describe("ConfigureExternalChatsDialog", () => {
  it("shows the catalog request error when the temporary entry gate lets the user through", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        loadStatus: "error",
        loadError: "forbidden",
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load chats");
  });

  it("keeps an empty backfill catalog in a preparing state and offers retry", () => {
    const refresh = vi.fn();
    vi.mocked(useConfigureExternalChats).mockReturnValue(viewModel({ refresh }));

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Looking for available chats");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not declare no search results while an empty catalog is still preparing", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(viewModel({ query: "support" }));

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Looking for available chats");
    expect(screen.queryByText("No chats match your search.")).not.toBeInTheDocument();
  });

  it("renders all history values as an accessible radio group without project controls", () => {
    const changeHistoryDepth = vi.fn();
    vi.mocked(useConfigureExternalChats).mockReturnValue(viewModel({ changeHistoryDepth }));

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "History depth" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "new",
      "7_days",
      "30_days",
      "90_days",
      "all",
    ]);
    expect(screen.getByRole("radio", { name: "30 days" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save settings" })).toHaveClass("bg-transparent");
    expect(screen.queryByText(/save the settings before starting/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
    expect(changeHistoryDepth).toHaveBeenCalledWith("90_days");
    expect(screen.queryByLabelText(/project/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/project/i)).not.toBeInTheDocument();
  });

  it("edits the account selection mode and explains both directions", () => {
    const changeSelectionMode = vi.fn();
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({ changeSelectionMode, selectionMode: "explicit" }),
    );

    const { rerender } = renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const modeGroup = screen.getByRole("radiogroup", { name: "Connection mode" });
    expect(within(modeGroup).getByRole("radio", { name: /choose manually/i })).toBeChecked();
    expect(
      screen.queryByText(/does not remove chats that are already connected/i),
    ).not.toBeInTheDocument();
    fireEvent.click(within(modeGroup).getByRole("radio", { name: /connect automatically/i }));
    expect(changeSelectionMode).toHaveBeenCalledWith("all");

    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        selectionMode: "all",
        selectionModeDirty: true,
        settingsDirty: true,
        selectionBlockedBySettings: true,
      }),
    );
    rerender(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );
    expect(screen.getByText(/within the limit set by the administrator/i)).toBeVisible();
    expect(screen.getByText(/manual selection will be disabled/i)).toBeVisible();

    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        manualSelectionEnabled: false,
        selectionMode: "explicit",
        selectionModeDirty: true,
        settingsDirty: true,
        selectionBlockedBySettings: true,
      }),
    );
    rerender(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );
    expect(screen.getByText(/does not remove chats that are already connected/i)).toBeVisible();
  });

  it("warns about selected chats and blocks starting until dirty settings are saved", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        historyDepth: "90_days",
        historyDepthDirty: true,
        settingsDirty: true,
        saveStatus: "dirty",
        selectionBlockedBySettings: true,
        canSaveSettings: true,
        selectedCount: 2,
        pending: new Set(["chat-a"]),
        chats: [chat()],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByText(/restart history loading for 2 connected chats/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toHaveClass(
      "bg-accent",
      "text-black",
    );
    expect(screen.getByRole("button", { name: "Sync (1)" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Support" })).toBeDisabled();
    expect(screen.getByText(/save the settings before starting/i)).toBeInTheDocument();
  });

  it("disables history, sync, and retry actions while settings are saving", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        saveStatus: "saving",
        settingsBusy: true,
        selectionBlockedBySettings: true,
        pending: new Set(["chat-a"]),
        failed: new Set(["chat-a"]),
        chats: [chat()],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry failed" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sync (1)" })).toBeDisabled();
    expect(screen.getByText(/wait until the settings are saved/i)).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("offers an explicit current-version reload after a conflict", () => {
    const reloadAccountSettings = vi.fn();
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        historyDepth: "90_days",
        historyDepthDirty: true,
        saveStatus: "conflict",
        selectionBlockedBySettings: true,
        reloadAccountSettings,
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const alert = screen.getByRole("alert");
    const loadCurrent = within(alert).getByRole("button", { name: "Load current" });
    fireEvent.click(loadCurrent);
    expect(reloadAccountSettings).toHaveBeenCalledOnce();
  });

  it("keeps history editable but disables manual chat selection in automatic mode", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        manualSelectionEnabled: false,
        selectionMode: "all",
        selectionBlockedBySettings: true,
        chats: [chat()],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
    expect(screen.getByText(/automatic mode is on/i)).toBeVisible();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: "Support" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
  });

  it("keeps sync actions on the right of the footer while dismiss stays in the header", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        pending: new Set(["chat-a"]),
        readyCount: 0,
        selectedCount: 2,
        chats: [chat()],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const footer = dialog.querySelector<HTMLElement>("[data-app-dialog-footer]");
    const sync = screen.getByRole("button", { name: "Sync (1)" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(screen.getByText("0 of 2 chats ready")).toBeInTheDocument();
    expect(footer).not.toBeNull();
    expect(footer).toHaveClass("border-t");
    expect(footer).toContainElement(sync);
    expect(sync.parentElement).not.toContainElement(close);
    expect(close.closest("[data-app-dialog-title-row]")).not.toBeNull();
  });

  it("shows a select-all checkbox and forwards the group selection", () => {
    const toggleAllVisible = vi.fn();
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        selectableVisibleCount: 2,
        selectAllState: "none",
        toggleAllVisible,
        chats: [chat(), chat({ uuid: "chat-b", displayName: "Development" })],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const selectAll = screen.getByRole("checkbox", { name: "Select all in list" });
    expect(selectAll).not.toBeChecked();
    fireEvent.click(selectAll);
    expect(toggleAllVisible).toHaveBeenCalledOnce();
  });

  it("shows the mixed state when only some visible chats are selected", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        selectableVisibleCount: 2,
        selectAllState: "some",
        chats: [chat(), chat({ uuid: "chat-b", displayName: "Development" })],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select all in list" })).toBePartiallyChecked();
  });

  it("does not add per-chat settings, move, or deselect controls", () => {
    vi.mocked(useConfigureExternalChats).mockReturnValue(
      viewModel({
        selectedCount: 1,
        chats: [chat({ selected: true, status: "live", projectId: runtimeContext.projectId })],
      }),
    );

    renderWithProviders(
      <ConfigureExternalChatsDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={runtimeContext}
        account={account}
      />,
    );

    const row = screen.getByText("Support").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLLIElement).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row as HTMLLIElement).getByRole("checkbox")).toBeDisabled();
  });
});
