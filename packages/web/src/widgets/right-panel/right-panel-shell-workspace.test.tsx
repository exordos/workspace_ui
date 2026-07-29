import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "~/test/render";
import { RightPanelShell } from "./right-panel-shell.ui";

describe("RightPanelShell Workspace info", () => {
  it("renders Workspace direct private info instead of legacy user panel when workspaceInfo is present", () => {
    renderWithProviders(
      <RightPanelShell
        title="Legacy Alice"
        workspaceInfo={{
          kind: "directPrivate",
          directUserUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Workspace Alice",
          avatarUrl: null,
          status: "active",
          isOwnProfile: false,
          details: [
            {
              id: "email",
              value: "workspace-alice@example.com",
              isTemporarilyUnavailable: false,
            },
            {
              id: "phone",
              value: "Temporarily not connected",
              isTemporarilyUnavailable: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Workspace Alice")).toBeInTheDocument();
    expect(screen.getByText("workspace-alice@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Legacy Alice")).not.toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-message")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-call")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-share")).toBeInTheDocument();
  });
});
