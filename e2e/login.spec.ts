import { test, expect, LOGIN_BUTTON } from "./fixtures";

test.describe("Login page", () => {
  test("shows login form when no instances", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expect(guestPage.getByRole("button", { name: LOGIN_BUTTON })).toBeVisible();
  });

  test("has realm, email, and password fields", async ({ guestPage }) => {
    await guestPage.goto("/");
    await expect(guestPage.getByLabel(/адрес сервера|server url|zulip/i)).toBeVisible();
    await expect(guestPage.getByLabel(/^email$/i)).toBeVisible();
    await expect(guestPage.getByLabel(/^пароль$|^password$/i)).toBeVisible();
  });

  test("login button is present", async ({ guestPage }) => {
    await guestPage.goto("/");
    const button = guestPage.getByRole("button", { name: LOGIN_BUTTON });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
