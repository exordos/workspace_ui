import {
  test,
  expect,
  LOGIN_BUTTON,
  LOGIN_NEXT_BUTTON,
  LOGIN_SERVER_FIELD,
  expectLoginOrganizationStep,
} from "./fixtures";
import { E2E_EMAIL, E2E_REALM } from "./mocks/messenger-default-responses";

test.describe("Login page", () => {
  test("shows login form when no instances", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expectLoginOrganizationStep(guestPage);
  });

  test("has realm, username or email, and password fields across login steps", async ({
    guestPage,
    messengerApi: _messengerApi,
  }) => {
    await guestPage.goto("/");
    await guestPage.getByLabel(LOGIN_SERVER_FIELD).fill(E2E_REALM);
    await guestPage.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();

    const usernameOrEmail = guestPage.getByLabel(/username|email|имя пользователя/i);
    await expect(usernameOrEmail).toBeVisible();
    await usernameOrEmail.fill(E2E_EMAIL);
    await expect(guestPage.getByLabel(/^пароль$|^password$/i)).toBeVisible();
  });

  test("login button is present after entering email", async ({
    guestPage,
    messengerApi: _messengerApi,
  }) => {
    await guestPage.goto("/");
    await guestPage.getByLabel(LOGIN_SERVER_FIELD).fill(E2E_REALM);
    await guestPage.getByRole("button", { name: LOGIN_NEXT_BUTTON }).click();
    const usernameOrEmail = guestPage.getByLabel(/username|email|имя пользователя/i);
    await expect(usernameOrEmail).toBeVisible();
    await usernameOrEmail.fill(E2E_EMAIL);

    const button = guestPage.getByRole("button", { name: LOGIN_BUTTON });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
