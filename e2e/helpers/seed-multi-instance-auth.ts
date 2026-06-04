import type { Page } from "@playwright/test";
import { E2E_EMAIL, E2E_INSTANCE_ID, E2E_REALM } from "../mocks/zulip-default-responses";

export const E2E_INSTANCE_2_ID = "test-2";
export const E2E_REALM_2 = "https://zulip2.test.local";
export const E2E_EMAIL_2 = "other@example.com";

/** Seeds two Zulip instances in localStorage for instance-switch E2E. */
export async function seedMultiInstanceAuth(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ({
      primaryId,
      primaryRealm,
      primaryEmail,
      secondaryId,
      secondaryRealm,
      secondaryEmail,
    }) => {
      const instances = [
        {
          id: primaryId,
          realm: primaryRealm,
          email: primaryEmail,
          apiKey: `fixture-key-${primaryId}`,
        },
        {
          id: secondaryId,
          realm: secondaryRealm,
          email: secondaryEmail,
          apiKey: `fixture-key-${secondaryId}`,
        },
      ];
      localStorage.setItem("zulip-web-instances", JSON.stringify(instances));
      localStorage.setItem("zulip-web-current-instance", primaryId);
      for (const instance of instances) {
        localStorage.setItem(`workspace-theme-mode:${instance.id}`, "dark");
        localStorage.setItem(`workspace-palette:${instance.id}`, "orange-warm");
      }
    },
    {
      primaryId: E2E_INSTANCE_ID,
      primaryRealm: E2E_REALM,
      primaryEmail: E2E_EMAIL,
      secondaryId: E2E_INSTANCE_2_ID,
      secondaryRealm: E2E_REALM_2,
      secondaryEmail: E2E_EMAIL_2,
    },
  );
}
