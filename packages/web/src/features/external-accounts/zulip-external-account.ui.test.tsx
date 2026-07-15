import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { publishExternalAccountUpdated } from "./external-account-realtime.lib";
import { ZulipExternalAccountCard } from "./zulip-external-account.ui";

const fetchZulipExternalAccountMock = vi.hoisted(() => vi.fn());
const saveZulipExternalAccountMock = vi.hoisted(() => vi.fn());
const unlinkZulipExternalAccountMock = vi.hoisted(() => vi.fn());
const fetchWorkspaceProvidersMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/external-accounts/external-accounts.api", () => ({
  fetchZulipExternalAccount: fetchZulipExternalAccountMock,
  saveZulipExternalAccount: saveZulipExternalAccountMock,
  unlinkZulipExternalAccount: unlinkZulipExternalAccountMock,
  fetchWorkspaceProviders: fetchWorkspaceProvidersMock,
}));

describe("ZulipExternalAccountCard", () => {
  beforeEach(() => {
    setLocale("en");
    fetchZulipExternalAccountMock.mockReset();
    fetchZulipExternalAccountMock.mockResolvedValue(null);
    fetchWorkspaceProvidersMock.mockReset();
    fetchWorkspaceProvidersMock.mockResolvedValue([
      {
        uuid: "provider-zulip",
        name: "Zulip provider",
        supportedKinds: ["zulip"],
        version: null,
      },
    ]);
    saveZulipExternalAccountMock.mockReset();
    saveZulipExternalAccountMock.mockResolvedValue({
      ok: true,
      account: {
        uuid: "account-1",
        providerUuid: "provider-zulip",
        externalUserId: "42",
        accountType: "zulip",
        hasCredentials: true,
        accountSettings: {
          kind: "zulip",
          login: "alice@example.com",
          serverUrl: "https://zulip.example.com",
        },
      },
    });
    unlinkZulipExternalAccountMock.mockReset();
    unlinkZulipExternalAccountMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    setLocale("en");
  });

  it("loads an existing Zulip account without pre-filling the token", async () => {
    fetchZulipExternalAccountMock.mockResolvedValue({
      uuid: "account-1",
      providerUuid: "provider-zulip",
      externalUserId: "42",
      accountType: "zulip",
      hasCredentials: true,
      accountSettings: {
        kind: "zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
      },
    });

    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByText("Zulip account connected")).toBeInTheDocument();
    expect(screen.queryByLabelText("Zulip user ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Zulip login")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlink zulip account/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /update zulip account/i }));
    expect(screen.getByLabelText("Zulip server URL")).toHaveValue("https://zulip.example.com");
    expect(screen.getByLabelText("Zulip login")).toHaveValue("alice@example.com");
    expect(screen.getByLabelText("Zulip API token")).toHaveValue("");
  });

  it("reloads the account when the common event stream reports an update", async () => {
    renderWithProviders(<ZulipExternalAccountCard />);
    await waitFor(() => expect(fetchZulipExternalAccountMock).toHaveBeenCalledOnce());
    fetchZulipExternalAccountMock.mockResolvedValue({
      uuid: "account-1",
      providerUuid: "provider-zulip",
      externalUserId: "42",
      accountType: "zulip",
      hasCredentials: true,
      accountSettings: {
        kind: "zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
      },
    });

    act(() => {
      publishExternalAccountUpdated({
        kind: "external_account.updated",
        account_type: "zulip",
      });
    });

    await waitFor(() => expect(fetchZulipExternalAccountMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Zulip account connected")).toBeInTheDocument();
  });

  it("creates a new Zulip account from form values", async () => {
    renderWithProviders(<ZulipExternalAccountCard />);

    await waitFor(() => expect(fetchZulipExternalAccountMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Zulip login")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add zulip account/i }));
    await screen.findByRole("option", { name: "Zulip provider" });
    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "provider-zulip" },
    });
    fireEvent.change(screen.getByLabelText("Zulip server URL"), {
      target: { value: "https://zulip.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Zulip login"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Zulip API token"), {
      target: { value: "z1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add zulip account/i }));

    await waitFor(() =>
      expect(saveZulipExternalAccountMock).toHaveBeenCalledWith({
        uuid: undefined,
        providerUuid: "provider-zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
        token: "z1",
      }),
    );
    expect(await screen.findByText("Zulip account saved")).toBeInTheDocument();
    expect(screen.queryByLabelText("Zulip API token")).not.toBeInTheDocument();
  });

  it("updates the existing Zulip account by uuid", async () => {
    fetchZulipExternalAccountMock.mockResolvedValue({
      uuid: "account-1",
      providerUuid: "provider-zulip",
      externalUserId: "42",
      accountType: "zulip",
      hasCredentials: true,
      accountSettings: {
        kind: "zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
      },
    });

    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByText("Zulip account connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /update zulip account/i }));
    fireEvent.change(screen.getByLabelText("Zulip server URL"), {
      target: { value: "https://next-zulip.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Zulip API token"), {
      target: { value: "z2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update zulip account/i }));

    await waitFor(() =>
      expect(saveZulipExternalAccountMock).toHaveBeenCalledWith({
        uuid: "account-1",
        providerUuid: "provider-zulip",
        login: "alice@example.com",
        serverUrl: "https://next-zulip.example.com",
        token: "z2",
      }),
    );
  });

  it("unlinks the existing Zulip account", async () => {
    fetchZulipExternalAccountMock.mockResolvedValue({
      uuid: "account-1",
      providerUuid: "provider-zulip",
      externalUserId: "42",
      accountType: "zulip",
      hasCredentials: true,
      accountSettings: {
        kind: "zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
      },
    });

    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByText("Zulip account connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /unlink zulip account/i }));

    await waitFor(() => expect(unlinkZulipExternalAccountMock).toHaveBeenCalledWith("account-1"));
    expect(await screen.findByText("Zulip account unlinked")).toBeInTheDocument();
    expect(screen.getByText("Zulip account not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlink zulip account/i })).not.toBeInTheDocument();
  });

  it("treats an account without credentials as not connected and keeps the URL", async () => {
    fetchZulipExternalAccountMock.mockResolvedValue({
      uuid: "account-2",
      providerUuid: "provider-zulip",
      accountType: "zulip",
      hasCredentials: false,
      accountSettings: {
        kind: "zulip",
        login: "",
        serverUrl: "https://zulip.example.com",
      },
    });

    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByText("Zulip account not connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlink zulip account/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /link zulip account/i }));
    expect(screen.getByLabelText("Zulip server URL")).toHaveValue("https://zulip.example.com");
    fireEvent.change(screen.getByLabelText("Zulip login"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Zulip API token"), {
      target: { value: "z1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /link zulip account/i }));

    await waitFor(() =>
      expect(saveZulipExternalAccountMock).toHaveBeenCalledWith({
        uuid: "account-2",
        providerUuid: "provider-zulip",
        login: "alice@example.com",
        serverUrl: "https://zulip.example.com",
        token: "z1",
      }),
    );
  });

  it("requires all Zulip fields before saving", async () => {
    renderWithProviders(<ZulipExternalAccountCard />);

    await waitFor(() => expect(fetchZulipExternalAccountMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /add zulip account/i }));
    expect(screen.getByLabelText("Zulip server URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Zulip login")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add zulip account/i }));

    expect(screen.getByText("Fill in Zulip server URL, login, and token")).toBeInTheDocument();
    expect(saveZulipExternalAccountMock).not.toHaveBeenCalled();
  });
});
