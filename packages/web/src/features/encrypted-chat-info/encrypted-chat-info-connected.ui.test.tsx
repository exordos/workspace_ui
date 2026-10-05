import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedChatInfoConnected } from "./encrypted-chat-info-connected.ui";

const mocks = vi.hoisted(() => ({ info: vi.fn(), crypto: vi.fn() }));
vi.mock("./encrypted-chat-info.hook", () => ({ useEncryptedChatInfo: mocks.info }));
vi.mock("./chat-crypto-session.hook", () => ({ useChatCryptoSession: mocks.crypto }));
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
    getRights: () => ({ canRotate: true }),
    getKeyRequestOutcomes: () => [
      { request: { uuid: "old" }, status: "pending" },
      { request: { uuid: "done" }, status: "granted" },
      { request: { uuid: "rejected" }, status: "rejected" },
    ],
    canGrantKey: (uuid: string) => uuid === "old",
    canRejectKey: (uuid: string) => uuid === "old",
  };
  const crypto = {
    session,
    state: { pending: false, access: "missing" },
    loading: false,
    error: null,
    requestErrors: {},
    reissueKey: vi.fn().mockResolvedValue(true),
    grantAllKeys: vi.fn().mockResolvedValue(true),
    grantKey: vi.fn().mockResolvedValue(undefined),
    rejectKey: vi.fn().mockResolvedValue(undefined),
  };
  const info = {
    projection: {
      stream: {
        name: "Protected",
        currentEncryptionKey: { keyUuid: "current", keyFingerprint: "fingerprint" },
      },
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
});
afterEach(cleanup);
describe("encrypted chat sidebar actions", () => {
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
  it("opens the key screen with paired device names and no actions on completed requests", () => {
    fixture();
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Granted keys in loaded history (1)")).toBeInTheDocument();
    expect(screen.getByText("Rejected requests in loaded history (1)")).toBeInTheDocument();
    expect(screen.getByText("Granted device")).toBeInTheDocument();
    expect(screen.getByText("Rejected device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grant access to Granted" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });
  it("requires confirmation and leaves a failed reissue open for retry", async () => {
    const { crypto } = fixture();
    crypto.reissueKey.mockResolvedValue(false);
    render(<EncryptedChatInfoConnected streamUuid="stream" />);
    fireEvent.click(screen.getByRole("button", { name: "Reissue key" }));
    expect(crypto.reissueKey).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Previous keys remain available/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Reissue key" }));
      await Promise.resolve();
    });
    expect(crypto.reissueKey).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
          currentEncryptionKey: { keyUuid: "next", keyFingerprint: "next fingerprint" },
        },
      },
    });
    view.rerender(<EncryptedChatInfoConnected streamUuid="stream" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("next fingerprint")).toBeInTheDocument();
  });
});
