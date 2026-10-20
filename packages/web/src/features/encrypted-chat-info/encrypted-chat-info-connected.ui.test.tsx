import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealChatKeyChange } from "~/entities/messenger/chat-crypto-resources.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { EncryptedChatInfoConnected } from "./encrypted-chat-info-connected.ui";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  crypto: vi.fn(),
  keyChanges: vi.fn<(listener: (change?: RealChatKeyChange) => void) => () => void>(),
}));
vi.mock("./encrypted-chat-info.hook", () => ({ useEncryptedChatInfo: mocks.info }));
vi.mock("./chat-crypto-session.hook", () => ({ useChatCryptoSession: mocks.crypto }));
vi.mock("~/entities/messenger/chat-crypto-resources.lib", () => ({
  subscribeRealChatKeyChanges: mocks.keyChanges,
}));
function fixture() {
  const request = (uuid: string, name: string) => ({
    requestMessageUuid: uuid,
    name,
    deviceName: `${name} device`,
    canGrant: false,
    canReject: false,
  });
  const requests = [
    request("old", "Old epoch"),
    request("done", "Granted"),
    request("rejected", "Rejected"),
  ];
  const session = {
    scope: {
      owner: {
        accountId: "account",
        instanceId: "instance",
        organizationId: "organization",
        projectId: "project",
        userUuid: "user",
      },
      deviceId: "device",
      streamUuid: "stream",
    },
    getRights: () => ({ canRotate: true, canRequest: true, canGrant: true, canReject: true }),
    subscribe: vi.fn((_listener: () => void) => () => undefined),
    listLocalKeys: vi
      .fn<() => Promise<{ keyUuid: string; receivedAt: number | null }[]>>()
      .mockResolvedValue([]),
    getKeyRequestOutcomes: () => [
      { request: { uuid: "old" }, status: "pending" },
      { request: { uuid: "done" }, status: "granted" },
      { request: { uuid: "rejected" }, status: "rejected" },
    ],
    canGrantKey: (uuid: string): boolean => uuid === "old",
    canRejectKey: (uuid: string): boolean => uuid === "old",
  };
  const crypto = {
    session,
    state: { pending: false, access: "missing" },
    loading: false,
    error: null,
    requestErrors: {},
    requestKey: vi.fn().mockResolvedValue(true),
    removeLocalKey: vi.fn().mockResolvedValue(true),
    reissueKey: vi.fn().mockResolvedValue(true),
    grantAllKeys: vi.fn().mockResolvedValue(true),
    grantKey: vi.fn().mockResolvedValue(undefined),
    rejectKey: vi.fn().mockResolvedValue(undefined),
  };
  const info = {
    projection: {
      stream: {
        name: "Protected",
        currentEncryptionKey: { keyUuid: "current" },
      },
      keyAnnouncementDates: {} as Record<string, string>,
      requests,
      members: [],
      onlineCount: 0,
    },
    onCopyKey: vi.fn(),
    copyError: null,
  };
  mocks.crypto.mockReturnValue(crypto);
  mocks.info.mockReturnValue(info);
  return { crypto, info };
}
beforeEach(() => {
  mocks.crypto.mockReset();
  mocks.info.mockReset();
  mocks.keyChanges.mockReset().mockReturnValue(() => undefined);
});
afterEach(cleanup);
describe("encrypted chat sidebar actions", () => {
  it("uses the stream color for the protected chat avatar", () => {
    const { info } = fixture();
    mocks.info.mockReturnValue({
      ...info,
      projection: { ...info.projection, stream: { ...info.projection.stream, color: 0x2563eb } },
    });
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(screen.getByRole("img", { name: "Protected chat" }).parentElement).toHaveStyle({
      backgroundColor: "#2563eb",
    });
  });

  it.each(["info", "key"] as const)(
    "hides key rotation for a participant on the %s screen while keeping the current key",
    async (activeScreen) => {
      const { crypto, info } = fixture();
      crypto.session.getRights = () => ({
        canRotate: false,
        canRequest: true,
        canGrant: false,
        canReject: false,
      });
      await act(async () => {
        render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      expect(screen.getByText("current")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reissue key" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Copy key ID" }));
      expect(info.onCopyKey).toHaveBeenCalledOnce();
      expect(crypto.reissueKey).not.toHaveBeenCalled();
    },
  );

  it.each(["info", "key"] as const)(
    "allows the owner to confirm key rotation on the %s screen",
    async (activeScreen) => {
      const { crypto } = fixture();
      await act(async () => {
        render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      const button = screen.getByRole("button", { name: "Reissue key" });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(crypto.reissueKey).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", { name: "Reissue key" }),
        );
        await Promise.resolve();
      });
      expect(crypto.reissueKey).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { activeScreen: "info", loading: true, pending: false },
    { activeScreen: "key", loading: true, pending: false },
    { activeScreen: "info", loading: false, pending: true },
    { activeScreen: "key", loading: false, pending: true },
  ] as const)(
    "keeps owner rotation visible but disabled on $activeScreen when loading=$loading and pending=$pending",
    async ({ activeScreen, loading, pending }) => {
      const { crypto } = fixture();
      mocks.crypto.mockReturnValue({
        ...crypto,
        loading,
        state: { ...crypto.state, pending },
      });
      await act(async () => {
        render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      const button = screen.getByRole("button", { name: "Reissue key" });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(crypto.reissueKey).not.toHaveBeenCalled();
    },
  );

  it("does not display a generic crypto failure above the channel information", () => {
    const { crypto } = fixture();
    mocks.crypto.mockReturnValue({ ...crypto, error: "Unrelated crypto failure" });
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(screen.getByText("Protected")).toBeInTheDocument();
    expect(screen.queryByText("Unrelated crypto failure")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("connects the add-member button to the owning panel action", () => {
    fixture();
    const onAddMember = vi.fn();
    const view = render(
      <EncryptedChatInfoConnected streamUuid="stream" onAddMember={onAddMember} />,
    );
    const button = screen.getByRole("button", { name: "Add members" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAddMember).toHaveBeenCalledOnce();
    view.rerender(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(screen.queryByRole("button", { name: "Add members" })).toBeNull();
  });

  it("connects owner removal capabilities to binding IDs and hides actions without a controller", () => {
    const { info } = fixture();
    mocks.info.mockReturnValue({
      ...info,
      projection: {
        ...info.projection,
        members: [
          { id: "binding-owner", name: "Owner" },
          { id: "binding-member", name: "Member" },
        ],
      },
    });
    const onRemoveMember = vi.fn();
    const view = render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        onRemoveMember={onRemoveMember}
        removableMemberIds={["binding-owner", "binding-member"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove from channel: Member" }));
    expect(onRemoveMember).toHaveBeenCalledWith("binding-member");
    expect(screen.getByRole("button", { name: "Remove from channel: Owner" })).toBeEnabled();
    view.rerender(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        removableMemberIds={["binding-owner", "binding-member"]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Remove from channel:/ })).toBeNull();
  });

  it("allows only the member's own removal when the owning panel grants self-removal", () => {
    const { info } = fixture();
    mocks.info.mockReturnValue({
      ...info,
      projection: {
        ...info.projection,
        members: [
          { id: "binding-self", name: "Self" },
          { id: "binding-other", name: "Other member" },
        ],
      },
    });
    const onRemoveMember = vi.fn();
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        onRemoveMember={onRemoveMember}
        removableMemberIds={["binding-self"]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Remove from channel: Other member" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove from channel: Self" }));
    expect(onRemoveMember).toHaveBeenCalledWith("binding-self");
    expect(screen.queryByRole("button", { name: "Add members" })).toBeNull();
  });

  it("disables only the pending removal and keeps its error in the member section", () => {
    const { crypto, info } = fixture();
    mocks.crypto.mockReturnValue({ ...crypto, error: "Unrelated crypto failure" });
    mocks.info.mockReturnValue({
      ...info,
      projection: {
        ...info.projection,
        members: [
          { id: "binding-pending", name: "Pending member" },
          { id: "binding-ready", name: "Ready member" },
        ],
      },
    });
    const onRemoveMember = vi.fn();
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        onRemoveMember={onRemoveMember}
        removableMemberIds={["binding-pending", "binding-ready"]}
        removingMemberIds={["binding-pending"]}
        removeMemberError="Member removal failed"
      />,
    );
    const pendingButton = screen.getByRole("button", {
      name: "Remove from channel: Pending member",
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(onRemoveMember).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove from channel: Ready member" })).toBeEnabled();
    const memberSection = screen.getByRole("region", { name: "Members" });
    expect(within(memberSection).getByRole("alert")).toHaveTextContent("Member removal failed");
    expect(screen.queryByText("Unrelated crypto failure")).toBeNull();
  });

  it("uses generation-specific grant capability and removes terminal outcomes from incoming requests", () => {
    const { crypto } = fixture();
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    const grant = screen.getByRole("button", { name: "Grant access to Old epoch" });
    expect(grant).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Grant access to Granted" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Grant access to Rejected" })).toBeNull();
    fireEvent.click(grant);
    expect(crypto.grantKey).toHaveBeenCalledWith("old");
    fireEvent.click(screen.getByRole("button", { name: "Grant all" }));
    expect(crypto.grantAllKeys).toHaveBeenCalledOnce();
  });
  it.each(["info", "key"] as const)(
    "hides requests and their history after management rights are revoked on the %s screen",
    async (activeScreen) => {
      const { crypto } = fixture();
      const view = render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
      expect(screen.getByText("Showing loaded history.")).toBeInTheDocument();
      crypto.session.getRights = () => ({
        canRotate: false,
        canRequest: true,
        canGrant: false,
        canReject: false,
      });
      await act(async () => {
        view.rerender(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      expect(screen.queryByText("Showing loaded history.")).toBeNull();
      expect(screen.queryByText(/Security key requests|Incoming requests/)).toBeNull();
      expect(screen.queryByRole("button", { name: /Granted keys|Rejected requests/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Grant all" })).toBeNull();
      expect(screen.queryByText("Old epoch device")).toBeNull();
      expect(screen.getByText("current")).toBeInTheDocument();
      if (activeScreen === "key")
        expect(screen.getByRole("button", { name: "Request current key" })).toBeEnabled();
      expect(crypto.grantKey).not.toHaveBeenCalled();
      expect(crypto.rejectKey).not.toHaveBeenCalled();
    },
  );
  it.each(["info", "key"] as const)(
    "shows requests to a manager without the requested local key on the %s screen",
    async (activeScreen) => {
      const { crypto } = fixture();
      crypto.session.canGrantKey = () => false;
      await act(async () => {
        render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      if (activeScreen === "key")
        fireEvent.click(screen.getByRole("button", { name: "Incoming requests (1)" }));
      expect(screen.queryByRole("button", { name: "Grant access to Old epoch" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Grant all" })).toBeNull();
      expect(screen.getByRole("button", { name: "Reject request from Old epoch" })).toBeEnabled();
    },
  );
  it.each(["info", "key"] as const)(
    "keeps requests read-only when no request actions are available on the %s screen",
    async (activeScreen) => {
      const { crypto } = fixture();
      crypto.session.canGrantKey = () => false;
      crypto.session.canRejectKey = () => false;
      await act(async () => {
        render(<EncryptedChatInfoConnected streamUuid="stream" screen={activeScreen} />);
        await Promise.resolve();
      });
      if (activeScreen === "key")
        fireEvent.click(screen.getByRole("button", { name: "Incoming requests (1)" }));
      expect(screen.getByText("Old epoch device")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Grant access to|Reject request from|Grant all/ }),
      ).toBeNull();
      expect(crypto.grantKey).not.toHaveBeenCalled();
      expect(crypto.rejectKey).not.toHaveBeenCalled();
      expect(crypto.grantAllKeys).not.toHaveBeenCalled();
    },
  );
  it("keeps permitted request actions disabled during an operation", () => {
    const { crypto } = fixture();
    crypto.state.pending = true;
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    for (const name of [
      "Grant access to Old epoch",
      "Reject request from Old epoch",
      "Grant all",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(crypto.grantKey).not.toHaveBeenCalled();
    expect(crypto.rejectKey).not.toHaveBeenCalled();
    expect(crypto.grantAllKeys).not.toHaveBeenCalled();
  });
  it("reports settings/key navigation to its drawer owner and renders only the active body", async () => {
    fixture();
    const navigate = vi.fn();
    const view = render(
      <EncryptedChatInfoConnected streamUuid="stream" onScreenChange={navigate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(navigate).toHaveBeenCalledWith("settings");
    view.rerender(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        screen="settings"
        onScreenChange={navigate}
      />,
    );
    expect(screen.getByText("Channel details are currently read-only.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Encryption keys" }));
    expect(navigate).toHaveBeenLastCalledWith("key");
    view.rerender(
      <EncryptedChatInfoConnected streamUuid="stream" screen="key" onScreenChange={navigate} />,
    );
    expect(view.container.querySelector("aside")).toBeNull();
    expect(view.container.querySelector("details")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByText("Granted device")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Granted keys (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Rejected requests (1)" }));
    expect(screen.getByText("Granted device")).toBeInTheDocument();
    expect(screen.getByText("Rejected device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grant access to Granted" })).toBeNull();
    expect(screen.getByText("Showing loaded history.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Request current key" })).toBeEnabled(),
    );
  });
  it("requires confirmation and leaves a failed reissue open for retry", async () => {
    const { crypto } = fixture();
    crypto.reissueKey.mockResolvedValue(false);
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    fireEvent.click(screen.getByRole("button", { name: "Reissue key" }));
    expect(crypto.reissueKey).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByText(/Previous keys remain available/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Reissue key" }));
      await Promise.resolve();
    });
    expect(crypto.reissueKey).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "Could not reissue the encryption key. Please try again.",
    );
    crypto.reissueKey.mockResolvedValue(true);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Reissue key" }));
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("disables actions while pending and drops confirmation if the active generation changes", () => {
    const { crypto, info } = fixture();
    const view = render(<EncryptedChatInfoConnected streamUuid="stream" />);
    fireEvent.click(screen.getByRole("button", { name: "Reissue key" }));
    mocks.crypto.mockReturnValue({ ...crypto, state: { pending: true, access: "missing" } });
    view.rerender(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Reissue key" }),
    ).toBeDisabled();
    expect(screen.getByText("Grant all").closest("button")).toBeDisabled();
    mocks.info.mockReturnValue({
      ...info,
      projection: {
        ...info.projection,
        stream: {
          ...info.projection.stream,
          currentEncryptionKey: { keyUuid: "next" },
        },
      },
    });
    view.rerender(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("next")).toBeInTheDocument();
  });
  it("keeps the owner-selected key screen after rotation and does not let an old success dismiss a new confirmation", async () => {
    const { crypto, info } = fixture();
    let finishOld: ((success: boolean) => void) | undefined;
    crypto.reissueKey.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishOld = resolve;
      }),
    );
    const view = render(<EncryptedChatInfoConnected streamUuid="stream" screen="key" />);
    fireEvent.click(screen.getByRole("button", { name: "Reissue key" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Reissue key" }),
    );
    mocks.crypto.mockReturnValue({ ...crypto, session: { ...crypto.session } });
    mocks.info.mockReturnValue({
      ...info,
      projection: {
        ...info.projection,
        stream: {
          ...info.projection.stream,
          currentEncryptionKey: { keyUuid: "next" },
        },
      },
    });
    view.rerender(<EncryptedChatInfoConnected streamUuid="next-stream" screen="key" />);
    expect(screen.getByRole("button", { name: "Incoming requests (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reissue key" }));
    await act(async () => {
      finishOld?.(true);
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("local encrypted chat keys", () => {
  const oldKey = "aabbccdd-1111-2222-3333-444455556666";
  it("requests an absent current UUID while historical keys remain saved, with a collapsed compact inventory", async () => {
    const { crypto } = fixture();
    crypto.session.listLocalKeys.mockResolvedValue([
      { keyUuid: oldKey, receivedAt: Date.parse("2026-10-08T08:00:00Z") },
    ]);
    crypto.session.getRights = () => ({
      canRotate: false,
      canRequest: true,
      canGrant: false,
      canReject: false,
    });
    const openKey = vi.fn();
    render(
      <EncryptedChatInfoConnected streamUuid="stream" screen="key" onOpenLocalKey={openKey} />,
    );
    const requestCurrent = await screen.findByRole("button", { name: "Request current key" });
    expect(requestCurrent).toBeEnabled();
    const accordion = screen.getByRole("button", { name: "Keys on this device (1)" });
    expect(accordion).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Saved key: " + oldKey })).toBeNull();
    await act(async () => {
      fireEvent.click(requestCurrent);
      await Promise.resolve();
    });
    expect(crypto.requestKey).toHaveBeenCalledWith("current");
    expect(screen.getByText("Request sent. Waiting for the key.")).toBeInTheDocument();
    fireEvent.click(accordion);
    expect(screen.getByText("Historical")).toBeInTheDocument();
    expect(screen.getByText(/Added:/)).toBeInTheDocument();
    expect(screen.queryByText("Announced in chat")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Saved key: " + oldKey }));
    expect(openKey).toHaveBeenCalledWith(oldKey);
    expect(screen.queryByRole("button", { name: "Reissue key" })).toBeNull();
  });
  it("shows both dates on key details and repeats its exact UUID without rotation", async () => {
    const { crypto, info } = fixture();
    crypto.session.listLocalKeys.mockResolvedValue([
      { keyUuid: oldKey, receivedAt: Date.parse("2026-10-08T08:00:00Z") },
    ]);
    info.projection.keyAnnouncementDates[oldKey] = "2026-10-07T08:00:00Z";
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        screen="local-key"
        selectedLocalKeyUuid={oldKey}
      />,
    );
    await screen.findByText(oldKey);
    expect(screen.getByText("Announced in chat")).toBeInTheDocument();
    expect(screen.getByText("Added to this device")).toBeInTheDocument();
    expect(screen.getByText("Oct 7, 2026")).toBeInTheDocument();
    expect(screen.getByText("Oct 8, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reissue key" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Request this key again" }));
      await Promise.resolve();
    });
    expect(crypto.requestKey).toHaveBeenCalledWith(oldKey);
    expect(screen.getByText("Request sent. The saved key remains available.")).toBeInTheDocument();
    expect(crypto.removeLocalKey).not.toHaveBeenCalled();
  });
  it("requires confirmation for device deletion and returns to the inventory after success", async () => {
    const { crypto } = fixture();
    crypto.session.listLocalKeys.mockResolvedValue([{ keyUuid: oldKey, receivedAt: null }]);
    const navigate = vi.fn();
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        screen="local-key"
        selectedLocalKeyUuid={oldKey}
        onScreenChange={navigate}
      />,
    );
    await screen.findByText(oldKey);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Not found in loaded history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete from this device" }));
    expect(crypto.removeLocalKey).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete from this device" }),
      );
      await Promise.resolve();
    });
    expect(crypto.removeLocalKey).toHaveBeenCalledWith(oldKey);
    expect(navigate).toHaveBeenCalledWith("key");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each([false, true])(
    "discards old inventory and deletion completion when the next session is stale=%s",
    async (stale) => {
      const { crypto } = fixture();
      crypto.session.listLocalKeys.mockResolvedValue([{ keyUuid: oldKey, receivedAt: null }]);
      let finishRemoval: ((success: boolean) => void) | undefined;
      crypto.removeLocalKey.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finishRemoval = resolve;
        }),
      );
      const navigate = vi.fn();
      const view = render(
        <EncryptedChatInfoConnected
          streamUuid="stream"
          screen="local-key"
          selectedLocalKeyUuid={oldKey}
          onScreenChange={navigate}
        />,
      );
      await screen.findByText(oldKey);
      fireEvent.click(screen.getByRole("button", { name: "Delete from this device" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete from this device" }),
      );
      const nextSession = { ...crypto.session, listLocalKeys: vi.fn().mockResolvedValue([]) };
      if (stale)
        Object.defineProperty(nextSession, "scope", {
          get() {
            throw new Error("stale");
          },
        });
      mocks.crypto.mockReturnValue({ ...crypto, session: nextSession });
      view.rerender(
        <EncryptedChatInfoConnected
          streamUuid={stale ? "stream" : "another-stream"}
          screen="local-key"
          selectedLocalKeyUuid={oldKey}
          onScreenChange={navigate}
        />,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText(oldKey)).toBeNull();
      await act(async () => {
        finishRemoval?.(true);
        await Promise.resolve();
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          stale
            ? "Could not load keys from this device."
            : "This key is no longer saved on this device.",
        ),
      ).toBeInTheDocument();
      if (stale) expect(nextSession.listLocalKeys).not.toHaveBeenCalled();
    },
  );
  it("ignores a delayed inventory read from a previous session and supports retry after storage failure", async () => {
    const { crypto } = fixture();
    let finishRead: ((keys: { keyUuid: string; receivedAt: number | null }[]) => void) | undefined;
    crypto.session.listLocalKeys.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    const view = render(<EncryptedChatInfoConnected streamUuid="stream" screen="key" />);
    const nextList = vi.fn().mockRejectedValue(new Error("storage-failed"));
    mocks.crypto.mockReturnValue({
      ...crypto,
      session: { ...crypto.session, listLocalKeys: nextList },
    });
    view.rerender(<EncryptedChatInfoConnected streamUuid="next" screen="key" />);
    await act(async () => {
      finishRead?.([{ keyUuid: oldKey, receivedAt: null }]);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Keys on this device (0)" }));
    expect(screen.getByText("Could not load keys from this device.")).toBeInTheDocument();
    expect(screen.queryByText("Historical")).toBeNull();
    nextList.mockResolvedValue([{ keyUuid: "current", receivedAt: null }]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await Promise.resolve();
    });
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request current key" })).toBeNull();
  });
  it("retains selected details during a subscription refresh and handles an invalid legacy timestamp", async () => {
    const { crypto } = fixture();
    crypto.session.listLocalKeys.mockResolvedValue([
      { keyUuid: oldKey, receivedAt: Number.MAX_VALUE },
    ]);
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        screen="local-key"
        selectedLocalKeyUuid={oldKey}
      />,
    );
    await screen.findByText(oldKey);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(crypto.session.subscribe).not.toHaveBeenCalled();
    const notify = mocks.keyChanges.mock.calls[0]?.[0];
    const change: RealChatKeyChange = {
      kind: "removed",
      ownerKey: workspaceRuntimeOwnerKey(crypto.session.scope.owner),
      deviceId: "device",
      streamUuid: "stream",
      keyUuid: oldKey,
    };
    act(() => {
      notify?.({ ...change, ownerKey: "another-owner" });
      notify?.({ ...change, deviceId: "another-device" });
      notify?.({ ...change, streamUuid: "another-stream" });
    });
    expect(crypto.session.listLocalKeys).toHaveBeenCalledOnce();
    let finishRead: ((keys: { keyUuid: string; receivedAt: number | null }[]) => void) | undefined;
    crypto.session.listLocalKeys.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    act(() => {
      notify?.(change);
    });
    expect(crypto.session.listLocalKeys).toHaveBeenCalledTimes(2);
    expect(screen.getByText(oldKey)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request this key again" })).toBeEnabled();
    await act(async () => {
      finishRead?.([]);
      await Promise.resolve();
    });
    expect(screen.getByText("This key is no longer saved on this device.")).toBeInTheDocument();
  });
  it("does not claim a failed request was sent and retains failed deletion confirmation for retry", async () => {
    const { crypto } = fixture();
    crypto.session.listLocalKeys.mockResolvedValue([{ keyUuid: oldKey, receivedAt: null }]);
    crypto.requestKey.mockResolvedValue(false);
    crypto.removeLocalKey.mockResolvedValue(false);
    const navigate = vi.fn();
    render(
      <EncryptedChatInfoConnected
        streamUuid="stream"
        screen="local-key"
        selectedLocalKeyUuid={oldKey}
        onScreenChange={navigate}
      />,
    );
    await screen.findByText(oldKey);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Request this key again" }));
      await Promise.resolve();
    });
    expect(screen.queryByText("Request sent. The saved key remains available.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete from this device" }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Delete from this device" }),
      );
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "Could not delete the key from this device. Please try again.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
