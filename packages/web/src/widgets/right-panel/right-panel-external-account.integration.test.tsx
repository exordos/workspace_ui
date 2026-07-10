import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { renderWithProviders } from "~/test/render";
import { RightPanelConnectExternalAccountDialog } from "./right-panel-external-account.integration";

vi.mock("~/features/connect-external-account/connect-external-account-dialog.ui", () => ({
  ConnectExternalAccountDialog: ({
    runtimeContext,
  }: {
    runtimeContext: { accountId: string } | null;
  }) => <div data-testid="external-account-runtime">{runtimeContext?.accountId ?? "none"}</div>,
}));

describe("RightPanelConnectExternalAccountDialog", () => {
  afterEach(() => {
    useWorkspaceAuthStore.setState({
      sessions: [],
      currentAccountId: null,
      runtimeGeneration: 0,
    });
    vi.restoreAllMocks();
  });

  it("keeps the subscribed runtime context snapshot stable", () => {
    useWorkspaceAuthStore.setState({
      currentAccountId: "account-a",
      runtimeGeneration: 1,
      sessions: [
        {
          accountId: "account-a",
          instanceId: "instance-a",
          organizationId: "organization-a",
          organizationOrigin: "https://organization-a.example.com",
          projectId: "project-a",
          userUuid: "user-a",
          login: "user-a@example.com",
          accessToken: "access-token-a",
          runtimeGeneration: 1,
          profile: {
            uuid: "user-a",
            username: "user-a",
            firstName: "User",
            lastName: "A",
            email: "user-a@example.com",
          },
        },
      ],
    });

    renderWithProviders(<RightPanelConnectExternalAccountDialog open onOpenChange={vi.fn()} />);

    expect(document.querySelector('[data-testid="external-account-runtime"]')).toHaveTextContent(
      "account-a",
    );
  });
});
