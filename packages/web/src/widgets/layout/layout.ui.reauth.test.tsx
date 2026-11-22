import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkspaceReauthRequiredAccount } from "~/entities/workspace-auth/workspace-auth.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { Layout } from "./layout.ui";

afterEach(() => {
  useWorkspaceAuthStore.setState({
    currentAccountId: null,
    sessions: [],
    reauthRequiredAccounts: [],
  });
});

it("shows the usual prefilled login while the protected outlet is closed", () => {
  const account: WorkspaceReauthRequiredAccount = {
    accountId: "account-a",
    instanceId: "instance-a",
    organizationId: "workspace.example.com",
    organizationOrigin: "https://workspace.example.com",
    projectId: "project-a",
    userUuid: "user-a",
    login: "alice@example.com",
    profile: {
      uuid: "user-a",
      username: "alice",
      firstName: "Alice",
      lastName: null,
      email: "alice@example.com",
    },
  };
  const route = "/org/workspace.example.com/project/project-a/stream/stream-a";
  useWorkspaceAuthStore.setState({
    currentAccountId: account.accountId,
    sessions: [],
    reauthRequiredAccounts: [account],
  });
  const ProtectedChat = vi.fn(() => <p>Protected chat</p>);

  renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path={route} element={<ProtectedChat />} />
      </Route>
    </Routes>,
    { route },
  );

  const main = within(screen.getByRole("main"));
  expect(main.getByRole("heading", { name: t("auth.reauthTitle") })).toBeVisible();
  expect(main.getByLabelText(t("auth.emailOrLogin"))).toHaveValue(account.login);
  expect(main.getByLabelText(t("auth.password"))).toHaveValue("");
  expect(screen.getByTestId("instance-quick-account-a")).toBeVisible();
  expect(ProtectedChat).not.toHaveBeenCalled();
});
