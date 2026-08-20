import type { Page } from "@playwright/test";
import { test, expect, LOGIN_NEXT_BUTTON, expectLoginOrganizationStep } from "./fixtures";

const E2E_EMAIL = "e2e@example.test";
const LOGIN_EMAIL_FIELD = /email|логин/i;
const SERVER_SETTINGS_PATH = /^\/api\/workspace\/v1\/messenger\/server_settings\/?$/;

async function openCredentialsStep(page: Page): Promise<void> {
  const serverSettingsResponse = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      SERVER_SETTINGS_PATH.test(new URL(response.url()).pathname)
    );
  });

  await page.goto("/");

  expect((await serverSettingsResponse).ok()).toBe(true);
  await expect(page.getByLabel(LOGIN_EMAIL_FIELD)).toBeVisible();
}

test.describe("Login page", () => {
  test("uses the default web organization and keeps manual selection available", async ({
    guestPage,
  }) => {
    await openCredentialsStep(guestPage);

    await guestPage.getByRole("button", { name: /^organization$|^организация$/i }).click();
    await expectLoginOrganizationStep(guestPage);
  });

  test("has email and password fields on the credentials step", async ({ guestPage }) => {
    await openCredentialsStep(guestPage);
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);
    await expect(guestPage.getByLabel(/^пароль$|^password$/i)).toBeVisible();
  });

  test("login button is present after entering email", async ({ guestPage }) => {
    await openCredentialsStep(guestPage);
    await guestPage.getByLabel(LOGIN_EMAIL_FIELD).fill(E2E_EMAIL);

    const button = guestPage.getByRole("button", { name: LOGIN_NEXT_BUTTON });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
