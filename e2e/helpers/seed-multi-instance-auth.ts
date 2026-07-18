import type { Page } from "@playwright/test";
import { WORKSPACE_IAM_PROJECT_SCOPE_VERSION } from "../../packages/web/src/shared/config/workspace-project";
import {
  E2E_EMAIL,
  E2E_INSTANCE_ID,
  E2E_REALM,
  E2E_USER_UUID,
} from "../mocks/messenger-default-responses";

export const E2E_INSTANCE_2_ID = "test-2";
export const E2E_REALM_2 = "https://workspace2.test.local";
export const E2E_EMAIL_2 = "other@example.com";

function e2eIamAccessToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: E2E_USER_UUID, email })).toString("base64url");
  return `e2e.${payload}.signature`;
}

/** Seeds two organization instances in localStorage for instance-switch E2E. */
export async function seedMultiInstanceAuth(page: Page): Promise<void> {
  const primaryAccessToken = e2eIamAccessToken(E2E_EMAIL);
  const secondaryAccessToken = e2eIamAccessToken(E2E_EMAIL_2);
  await page.goto("/");
  await page.evaluate(
    ({
      primaryId,
      primaryRealm,
      primaryEmail,
      primaryAccessToken,
      projectScopeVersion,
      secondaryId,
      secondaryRealm,
      secondaryEmail,
      secondaryAccessToken,
    }) => {
      const instances = [
        {
          id: primaryId,
          realm: primaryRealm,
          login: primaryEmail,
          authType: "iam",
          iamAccessToken: primaryAccessToken,
          iamProjectScopeVersion: projectScopeVersion,
        },
        {
          id: secondaryId,
          realm: secondaryRealm,
          login: secondaryEmail,
          authType: "iam",
          iamAccessToken: secondaryAccessToken,
          iamProjectScopeVersion: projectScopeVersion,
        },
      ];
      localStorage.setItem("messenger-web-instances", JSON.stringify(instances));
      localStorage.setItem("messenger-web-current-instance", primaryId);
      for (const instance of instances) {
        localStorage.setItem(`workspace-theme-mode:${instance.id}`, "dark");
        localStorage.setItem(`workspace-palette:${instance.id}`, "orange-warm");
      }
    },
    {
      primaryId: E2E_INSTANCE_ID,
      primaryRealm: E2E_REALM,
      primaryEmail: E2E_EMAIL,
      primaryAccessToken,
      projectScopeVersion: WORKSPACE_IAM_PROJECT_SCOPE_VERSION,
      secondaryId: E2E_INSTANCE_2_ID,
      secondaryRealm: E2E_REALM_2,
      secondaryEmail: E2E_EMAIL_2,
      secondaryAccessToken,
    },
  );
}
