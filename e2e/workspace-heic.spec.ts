import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures";
import {
  e2eOrgBasePath,
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  openStreamChatWithComposer,
} from "./helpers/navigate-messenger";
import { E2E_MESSAGE_UUID, messageSuccess } from "./mocks/workspace-default-responses";

const LEGACY_FILE_UUID = "88888888-8888-4888-8888-888888888888";
const IMAGE_FILE_UUID = "99999999-9999-4999-8999-999999999999";
const LEGACY_MESSAGE_UUID = "77777777-7777-4777-8777-777777777777";
// Synthetic 48×32 solid color image.
const heicFixture = join(__dirname, "mocks/fixtures/solid-color.heic");

test("renders old and image HEIC references and downloads the original @mock", async ({
  authenticatedMocked: page,
}) => {
  const original = await readFile(heicFixture);
  const legacyMessage = {
    ...messageSuccess(
      `[legacy.HEIC](urn:file:${LEGACY_FILE_UUID}?content_type=application%2Foctet-stream)`,
      LEGACY_MESSAGE_UUID,
    ),
    created_at: "2026-07-15T10:00:00.000Z",
    updated_at: "2026-07-15T10:00:00.000Z",
  };
  const latestMessage = messageSuccess(
    `![photo.heic](urn:image:${IMAGE_FILE_UUID}?content_type=image%2Fheic)`,
    E2E_MESSAGE_UUID,
  );
  await page.route(/\/api\/workspace\/v1(?:\/|$)/, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (route.request().method() === "GET" && /\/messages\/?$/.test(path)) {
      if (url.searchParams.get("read") === "false") {
        await route.fulfill({ json: [] });
        return;
      }
      const descending = url.searchParams.get("sort_dir") === "desc";
      const messages = descending ? [latestMessage, legacyMessage] : [legacyMessage, latestMessage];
      const uuid = url.searchParams.get("uuid");
      await route.fulfill({
        json: messages.filter((message) => uuid == null || message.uuid === uuid),
      });
      return;
    }
    const legacy = path.endsWith(`/${LEGACY_FILE_UUID}/actions/download`);
    if (legacy || path.endsWith(`/${IMAGE_FILE_UUID}/actions/download`)) {
      await route.fulfill({
        body: original,
        contentType: legacy ? "application/octet-stream" : "image/heic",
        headers: {
          "content-disposition": `attachment; filename="${legacy ? "legacy.HEIC" : "photo.heic"}"`,
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  const legacy = page.locator(`[data-workspace-file-uuid="${LEGACY_FILE_UUID}"]`);
  const image = page.locator(`[data-workspace-file-uuid="${IMAGE_FILE_UUID}"]`);
  for (const attachment of [legacy, image]) {
    await attachment.scrollIntoViewIfNeeded();
    await expect(attachment.locator("img[data-workspace-file-preview]")).toHaveJSProperty(
      "naturalWidth",
      48,
    );
  }

  await legacy.click();
  const gallery = page.getByRole("dialog", { name: "Просмотр медиа" });
  const preview = gallery.locator('img[alt="legacy.HEIC"]');
  await expect(preview).toHaveJSProperty("naturalWidth", 48);
  await expect
    .poll(() =>
      preview.evaluate(async (image: HTMLImageElement) => {
        const response = await fetch(image.src);
        return response.headers.get("content-type");
      }),
    )
    .toBe("image/jpeg");
  const downloaded = page.waitForEvent("download");
  await gallery.getByRole("button", { name: "Скачать", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("legacy.HEIC");
  expect(await readFile(await download.path())).toEqual(original);
});

test("previews new HEIC in the composer and uploads its original bytes @mock", async ({
  authenticatedMocked: page,
}) => {
  const original = await readFile(heicFixture);
  await openStreamChatWithComposer(page);
  await page.route(/\/messenger\/files\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        uuid: IMAGE_FILE_UUID,
        name: "camera.HEIC",
        content_type: "image/heic",
        size_bytes: original.byteLength,
      },
    });
  });

  const uploaded = page.waitForRequest(
    (request) =>
      request.method() === "POST" && /\/messenger\/files\/?$/.test(new URL(request.url()).pathname),
  );
  const composer = page.getByRole("form", { name: /поле ввода сообщения|message composer/i });
  await composer.locator('input[type="file"]').setInputFiles({
    name: "camera.HEIC",
    mimeType: "image/heic",
    buffer: original,
  });
  const body = (await uploaded).postDataBuffer();
  expect(body?.includes(original)).toBe(true);
  expect(body?.toString("latin1")).toContain('filename="camera.HEIC"');
  expect(body?.toString("latin1")).toContain("Content-Type: image/heic");
  await expect(composer.getByRole("img", { name: "camera.HEIC" })).toHaveJSProperty(
    "naturalWidth",
    48,
  );
});
