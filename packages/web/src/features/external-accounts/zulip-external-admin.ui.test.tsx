import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { ZulipExternalAdminPanel } from "./zulip-external-admin.ui";
import type {
  ExternalBridgeInstance,
  ExternalProviderHealth,
  ExternalProviderPolicy,
} from "./external-accounts.types";

const api = vi.hoisted(() => ({
  changeBridgeStatus: vi.fn(),
  changeProviderSuspension: vi.fn(),
  fetchBridgeInstances: vi.fn(),
  fetchHealth: vi.fn(),
  fetchPolicy: vi.fn(),
  updatePolicy: vi.fn(),
}));

vi.mock("./external-accounts.api", () => ({
  changeExternalBridgeInstanceStatus: api.changeBridgeStatus,
  changeZulipExternalProviderSuspension: api.changeProviderSuspension,
  fetchZulipExternalBridgeInstances: api.fetchBridgeInstances,
  fetchZulipExternalProviderHealth: api.fetchHealth,
  fetchZulipExternalProviderPolicy: api.fetchPolicy,
  updateZulipExternalProviderPolicy: api.updatePolicy,
}));

const policy: ExternalProviderPolicy = {
  provider: "zulip",
  enabled: true,
  emergencySuspended: false,
  limits: {
    maxAccounts: 1,
    maxSelectedChatsPerAccount: 100,
    maxFileBytes: 10_000_000,
  },
  customCaBundle: null,
  revision: 3,
  etag: '"3"',
};

const health: ExternalProviderHealth = {
  provider: "zulip",
  status: "healthy",
  accountCounts: { live: 2 },
  bridgeCounts: { active: 1 },
  operationCounts: { pending: 0 },
  metrics: {},
  updatedAt: "2026-07-17T12:00:00Z",
};

const bridge: ExternalBridgeInstance = {
  uuid: "bridge-1",
  provider: "zulip",
  identityGeneration: 2,
  status: "active",
  capabilities: {},
  lastHeartbeatAt: "2026-07-17T12:00:00Z",
  certificateNotAfter: "2026-08-16T12:00:00Z",
  safeError: null,
  revision: 4,
};

describe("ZulipExternalAdminPanel", () => {
  beforeEach(() => {
    setLocale("en");
    vi.clearAllMocks();
    api.fetchPolicy.mockResolvedValue(policy);
    api.fetchHealth.mockResolvedValue(health);
    api.fetchBridgeInstances.mockResolvedValue([bridge]);
  });

  it("stays hidden when the current user cannot read any admin resource", async () => {
    api.fetchPolicy.mockResolvedValue(null);
    api.fetchHealth.mockResolvedValue(null);
    api.fetchBridgeInstances.mockResolvedValue(null);

    renderWithProviders(<ZulipExternalAdminPanel />);

    await waitFor(() => expect(api.fetchPolicy).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("zulip-admin-panel")).not.toBeInTheDocument();
  });

  it("renders provider health and invokes the emergency suspension action", async () => {
    api.changeProviderSuspension.mockResolvedValue({
      ok: true,
      value: { ...policy, emergencySuspended: true, revision: 4, etag: '"4"' },
    });

    renderWithProviders(<ZulipExternalAdminPanel />);

    expect(await screen.findByTestId("zulip-admin-panel")).toHaveTextContent("healthy");
    expect(screen.getByTestId("zulip-admin-health")).toHaveTextContent("active: 1");
    expect(screen.getByText("live: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("zulip-admin-provider-suspend"));

    await waitFor(() => expect(api.changeProviderSuspension).toHaveBeenCalledWith("suspend"));
    expect(await screen.findByTestId("zulip-admin-provider-resume")).toBeInTheDocument();
  });

  it("exposes stable selectors for visible policy and bridge-instance acceptance", async () => {
    renderWithProviders(<ZulipExternalAdminPanel />);

    await screen.findByTestId("zulip-admin-panel");
    expect(screen.getByTestId("zulip-admin-provider-enabled")).toBeChecked();
    expect(screen.getByTestId("zulip-admin-limit-max-accounts")).toHaveValue(1);
    expect(screen.getByTestId("zulip-admin-limit-max-selected-chats")).toHaveValue(100);
    expect(screen.getByTestId("zulip-admin-limit-max-file-bytes")).toHaveValue(10_000_000);
    expect(screen.getByTestId("zulip-admin-custom-ca")).toHaveValue("");
    expect(screen.getByTestId("zulip-admin-policy-save")).toBeEnabled();
    expect(screen.getByTestId("zulip-admin-bridge-instances")).toBeInTheDocument();
    expect(screen.getByTestId("external-bridge-instance-bridge-1")).toBeInTheDocument();
    expect(screen.getByTestId("external-bridge-instance-status-bridge-1")).toHaveTextContent(
      "active",
    );
    expect(screen.getByTestId("external-bridge-instance-suspend-bridge-1")).toBeEnabled();

    fireEvent.click(screen.getByTestId("external-bridge-instance-revoke-bridge-1"));
    expect(
      screen.getByTestId("external-bridge-instance-revoke-confirmation-bridge-1"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("external-bridge-instance-revoke-cancel-bridge-1"));
    expect(
      screen.queryByTestId("external-bridge-instance-revoke-confirmation-bridge-1"),
    ).not.toBeInTheDocument();
  });

  it("exposes conditional selectors for CA removal and bridge resume", async () => {
    api.fetchPolicy.mockResolvedValue({
      ...policy,
      customCaBundle: {
        uuid: "ca-bundle-1",
        generation: 1,
        sha256: "sha256",
        certificateCount: 1,
      },
    });
    api.fetchBridgeInstances.mockResolvedValue([{ ...bridge, status: "suspended" }]);

    renderWithProviders(<ZulipExternalAdminPanel />);

    await screen.findByTestId("zulip-admin-panel");
    expect(screen.getByTestId("zulip-admin-custom-ca-remove")).toBeInTheDocument();
    expect(screen.getByTestId("external-bridge-instance-resume-bridge-1")).toBeEnabled();
  });
});
