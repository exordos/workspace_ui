import type { Page } from "@playwright/test";
import {
  E2E_ACCOUNT_ID,
  E2E_INSTANCE_ID,
  E2E_ORGANIZATION_ID,
  E2E_ORGANIZATION_ORIGIN,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
} from "../mocks/workspace-default-responses";

export async function seedAuthStorage(page: Page, apiKey?: string): Promise<string> {
  const key = apiKey ?? `fixture-key-${Date.now()}`;
  await page.goto("/");
  await page.evaluate(
    ({ accountId, instanceId, organizationId, organizationOrigin, projectId, userUuid, token }) => {
      const session = {
        accountId,
        instanceId,
        organizationId,
        organizationOrigin,
        projectId,
        userUuid,
        login: "e2e@example.test",
        accessToken: token,
        refreshToken: "e2e-refresh-token",
        expiresAtMs: Date.now() + 60 * 60 * 1000,
        runtimeGeneration: 0,
        profile: {
          uuid: userUuid,
          username: "e2e-user",
          firstName: "E2E",
          lastName: "User",
          email: "e2e@example.test",
          status: "active",
        },
      };
      localStorage.setItem("workspace-auth-sessions", JSON.stringify([session]));
      localStorage.setItem("workspace-auth-current-account", accountId);
      const ownerKey = [
        "account",
        accountId,
        "instance",
        instanceId,
        "organization",
        organizationId,
        "project",
        projectId,
        "user",
        userUuid,
      ].join(":");
      localStorage.setItem(`workspace-theme-mode:${ownerKey}`, "dark");
      localStorage.setItem(`workspace-palette:${ownerKey}`, "orange-warm");
    },
    {
      accountId: E2E_ACCOUNT_ID,
      instanceId: E2E_INSTANCE_ID,
      organizationId: E2E_ORGANIZATION_ID,
      organizationOrigin: E2E_ORGANIZATION_ORIGIN,
      projectId: E2E_PROJECT_ID,
      userUuid: E2E_USER_UUID,
      token: key,
    },
  );
  return key;
}
