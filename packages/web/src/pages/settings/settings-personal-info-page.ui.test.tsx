import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  type WorkspaceAuthSession,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { renderWithProviders } from "~/test/render";
import { SettingsPersonalInfoPage } from "./settings-personal-info-page.ui";
import type { ReactNode } from "react";

vi.mock("~/features/workspace-avatar/workspace-avatar.ui", () => ({
  WorkspaceAvatar: ({
    avatarUrn,
    children,
  }: {
    avatarUrn: string | null | undefined;
    children: ReactNode;
  }) => (
    <div data-testid="workspace-avatar" data-avatar-urn={avatarUrn ?? ""}>
      {children}
    </div>
  ),
}));

const SESSION: WorkspaceAuthSession = {
  accountId: "account-1",
  instanceId: "instance-1",
  organizationId: "organization-1",
  organizationOrigin: "https://workspace.example.com",
  projectId: "project-1",
  userUuid: "user-1",
  accessToken: "access-token",
  runtimeGeneration: 1,
  login: "alice@example.com",
  profile: {
    uuid: "user-1",
    username: "alice",
    firstName: "Alice",
    lastName: null,
    email: "alice@example.com",
  },
};

function createUser(avatarUrl: string): User {
  return {
    uuid: SESSION.userUuid,
    username: "alice",
    firstName: "Alice",
    lastName: null,
    displayName: "Alice",
    email: "alice@example.com",
    avatarUrl,
    status: "active",
    statusEmoji: null,
    statusText: null,
    lastPingAt: "2026-07-13T10:00:00.000Z",
    createdAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
  };
}

function renderWorkspacePage(avatarUrl: string): void {
  useWorkspaceAuthStore.setState({
    sessions: [SESSION],
    currentAccountId: SESSION.accountId,
    runtimeGeneration: SESSION.runtimeGeneration,
  });
  useUsersStore.getState().replaceUsers([createUser(avatarUrl)]);
  renderWithProviders(<SettingsPersonalInfoPage />);
}

describe("SettingsPersonalInfoPage Workspace avatar", () => {
  afterEach(() => {
    useWorkspaceAuthStore.getState().clear();
    useUsersStore.getState().clear();
  });

  it("passes an urn:image avatar to the Workspace avatar loader", () => {
    const avatarUrn = "urn:image:22222222-2222-4222-8222-222222222222";

    renderWorkspacePage(avatarUrn);

    expect(screen.getByTestId("workspace-avatar")).toHaveAttribute("data-avatar-urn", avatarUrn);
  });

  it("passes an external urn:url avatar to the Workspace avatar loader", () => {
    const avatarUrn = "urn:url:https://cdn.example.com/alice.png";

    renderWorkspacePage(avatarUrn);

    expect(screen.getByTestId("workspace-avatar")).toHaveAttribute("data-avatar-urn", avatarUrn);
  });
});
