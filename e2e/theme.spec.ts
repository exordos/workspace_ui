import { test, expect } from "./fixtures";

test.describe("Theme", () => {
  test("defaults to dark theme when authenticated", async ({ authenticated }) => {
    await expect(authenticated.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("can switch to light theme via devtools", async ({ authenticated }) => {
    await authenticated.evaluate(() => {
      (window as unknown as { __dev__: { theme: { toggle: () => void } } }).__dev__?.theme.toggle();
    });
    await expect(authenticated.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
