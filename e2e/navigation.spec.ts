import { test, expectLoginCredentialsStep } from "./fixtures";

test.describe("Navigation", () => {
  test("redirects to login when not authenticated", async ({ guestPage }) => {
    await guestPage.goto("/stream/general");
    await expectLoginCredentialsStep(guestPage);
  });
});
