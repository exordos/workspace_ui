import { messageSuccess, messagesSuccess } from "./mocks/workspace-default-responses";
import { test, expect } from "./fixtures";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";

const ID = "11111111-1111-4111-8111-111111111111";
const MARKDOWN = `![sticker](urn:sticker:${ID})`;

test("Workspace sticker send and history reload @mock", async ({ authenticated: page }) => {
  let favorite = false;
  let hidden = false;
  let blocked = false;
  await page.route("**/api/workspace/v1/messenger/stickers**", async (route) => {
    const url = new URL(route.request().url());
    const card = {
      id: ID,
      title: "Celebration",
      alt_text: "Sticker E2E celebration",
      emoji: [],
      tags: [],
      category: "sticker",
      media: { format: "gif", url: `/api/workspace/v1/messenger/stickers/${ID}/actions/download` },
      is_favorite: favorite,
    };
    if (url.pathname.endsWith("/download")) {
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      await route.fulfill(
        blocked
          ? { status: 404, body: "" }
          : {
              contentType: "image/gif",
              body: Buffer.from(
                "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                "base64",
              ),
            },
      );
    } else if (url.pathname.endsWith("/star/invoke")) {
      favorite = true;
      await route.fulfill({ status: 200, body: "" });
    } else if (url.pathname.endsWith("/unstar/invoke")) {
      favorite = false;
      await route.fulfill({ status: 200, body: "" });
    } else {
      const available = !blocked && (!hidden || url.searchParams.has("uuid"));
      await route.fulfill({
        json: available ? [card] : [],
        headers: { "X-Pagination-Limit": "50" },
      });
    }
  });
  let sentMessage: ReturnType<typeof messageSuccess> | null = null;
  await page.route(/\/api\/workspace\/v1\/messenger\/messages\/?(?:\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { payload: { content: string } };
      sentMessage = {
        ...messageSuccess(body.payload.content),
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      };
      await route.fulfill({ status: 201, json: sentMessage });
    } else {
      await route.fulfill({
        json: sentMessage ? [...messagesSuccess(), sentMessage] : messagesSuccess(),
      });
    }
  });
  await openStreamChatWithComposer(page);
  await page.getByRole("button", { name: /^эмод[зж]и$|^emoji$/i }).click();
  await page.getByRole("tab", { name: /стикеры|stickers/i }).click();
  const picker = page.getByTestId("composer-media-picker");
  await expect(picker.getByRole("button", { name: "Sticker E2E celebration" })).toBeVisible();
  await picker.getByRole("button", { name: /добавить в избранное|add to favorites/i }).click();
  await expect(
    picker.getByRole("button", { name: /убрать из избранного|remove from favorites/i }),
  ).toBeVisible();
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && /\/messages\/?$/.test(new URL(request.url()).pathname),
  );
  await picker.getByRole("button", { name: "Sticker E2E celebration" }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    payload: { kind: "markdown", content: MARKDOWN },
  });
  await expect(page.locator('[data-sticker-message="true"] img')).toBeVisible();
  hidden = true;
  await page.reload();
  await expect(page.locator('[data-sticker-message="true"] img')).toBeVisible();
  blocked = true;
  await page.reload();
  await expect(page.locator('[data-sticker-message="true"]')).toContainText(
    /недоступен|unavailable/i,
  );
  await expect(page.locator('[data-sticker-message="true"] img')).toHaveCount(0);
});

test("Sticker management dialog keeps the picker open and edits a card @mock", async ({
  authenticated: page,
}) => {
  const { E2E_PROJECT_ID, E2E_USER_UUID } = await import("./mocks/workspace-default-responses");
  await page.route("**/api/core/v1/iam/clients/default/actions/introspect", (route) =>
    route.fulfill({
      json: {
        user_info: { uuid: E2E_USER_UUID },
        project_id: E2E_PROJECT_ID,
        otp_verified: true,
        permissions: ["workspace.sticker_catalog.manage"],
      },
    }),
  );
  let title = "Celebration";
  await page.route("**/api/workspace/v1/messenger/stickers**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/download")) {
      await route.fulfill({
        contentType: "image/gif",
        body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
      });
      return;
    }
    if (route.request().method() === "PUT") {
      expect(route.request().postDataJSON()).toEqual({ title: "Updated celebration" });
      title = "Updated celebration";
    }
    const card = {
      id: ID,
      title,
      alt_text: "Sticker preview",
      tags: ["happy"],
      emoji: ["🎉"],
      category: "sticker",
      is_favorite: false,
      media: { format: "gif", url: `/api/workspace/v1/messenger/stickers/${ID}/actions/download` },
    };
    await route.fulfill({
      json: url.pathname.endsWith(ID) ? card : [card],
      headers: { "X-Pagination-Limit": "24" },
    });
  });
  await page.reload();
  await openStreamChatWithComposer(page);
  await page.getByRole("button", { name: /^эмод[зж]и$|^emoji$/i }).click();
  await page.getByRole("tab", { name: /стикеры|stickers/i }).click();
  await page
    .getByRole("button", { name: /управление каталогом стикеров|manage sticker catalog/i })
    .click();
  const dialog = page.getByRole("dialog", {
    name: /управление каталогом стикеров|manage sticker catalog/i,
  });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "/tmp/sticker-admin-import.png" });
  await dialog.getByRole("button", { name: /^редактирование$|^edit stickers$/i }).click();
  await dialog.getByRole("button", { name: /Celebration/ }).click();
  await dialog.getByLabel(/^название$|^title$/i).fill("Updated celebration");
  await page.screenshot({ path: "/tmp/sticker-admin-edit.png" });
  await dialog.getByRole("button", { name: /сохранить изменения|save changes/i }).click();
  await expect(dialog.getByText(/успешно сохранено|saved successfully/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("composer-media-picker")).toBeVisible();
});
