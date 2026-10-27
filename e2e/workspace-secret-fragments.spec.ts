import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
} from "../packages/web/src/shared/api/messenger.types";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

const PROTECTED_TEXT = "selected private phrase";

test("ordinary chat reuses shared keys for selected encrypted fragments and protects draft transport @mock", async ({
  authenticated: page,
}, testInfo) => {
  const stream = {
    ...streamsSuccess()[0],
    encryption: false,
    role: "member",
    owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    current_encryption_key_uuid: null as string | null,
  };
  const history: WorkspaceMessengerMessageDto[] = [];
  const requests: WorkspaceMessengerCreateMessageRequestBody[] = [];
  const draftWrites: unknown[] = [];
  let loseNextMarkdown = false;
  const committed = new Map<string, WorkspaceMessengerMessageDto>();
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    if (!path.endsWith("/streams") && !path.endsWith(E2E_STREAM_UUID)) return route.fallback();
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.route(/\/messenger\/drafts\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (["POST", "PUT"].includes(route.request().method())) {
      draftWrites.push(route.request().postDataJSON());
    }
    return route.fallback();
  });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      const unreadOnly = new URL(route.request().url()).searchParams.get("read") === "false";
      return route.fulfill({ json: unreadOnly ? [] : history });
    }
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
    if (!body.uuid) throw new Error("Missing canonical UUID");
    requests.push(body);
    const message = committed.get(body.uuid) ?? {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: body.payload,
      created_at: new Date(Date.UTC(2026, 9, 23, 12, 0, history.length)).toISOString(),
    };
    if (!committed.has(body.uuid)) history.push(message);
    committed.set(body.uuid, message);
    if (body.payload.kind === "markdown" && loseNextMarkdown) {
      loseNextMarkdown = false;
      return route.fulfill({ status: 503, json: { message: "Response lost after commit" } });
    }
    await route.fulfill({ status: 201, json: message });
  });
  const chatUrl = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`;
  await page.goto(chatUrl);
  const textarea = await expectReadyMessageComposer(page);
  await textarea.fill(":::");
  await page.waitForTimeout(1_200);
  expect(JSON.stringify(draftWrites)).not.toContain(":::");
  await textarea.pressSequentially("unfinished private phrase");
  await textarea.press("Enter");
  await expect(
    page.getByText(
      /Finish or remove the encrypted spoiler|Завершите или удалите шифрованный спойлер/i,
    ),
  ).toBeVisible();
  await expect(textarea).toHaveValue(":::unfinished private phrase");
  expect(requests).toHaveLength(0);
  expect(JSON.stringify(draftWrites)).not.toContain("unfinished private phrase");
  await textarea.fill("");
  const selectSecret = async (text: string, privateText: string) => {
    const expand = page.getByRole("button", {
      name: /show formatting tools|показать.*формат|показать.*инструмент/i,
    });
    if (await expand.isVisible()) await expand.click();
    await textarea.fill(text);
    await textarea.evaluate((element, selected) => {
      const start = element.value.indexOf(selected);
      element.focus();
      element.setSelectionRange(start, start + selected.length);
    }, privateText);
    await page.getByRole("button", { name: /^(encrypted spoiler|шифрованный спойлер)$/i }).click();
    await expect(textarea).toHaveValue(text.replace(privateText, `:::${privateText}:::`));
  };
  const expand = page.getByRole("button", {
    name: /show formatting tools|показать.*формат|показать.*инструмент/i,
  });
  if (await expand.isVisible()) await expand.click();
  await textarea.fill("Public before  public after");
  await textarea.evaluate((element) => {
    element.focus();
    const cursor = "Public before ".length;
    element.setSelectionRange(cursor, cursor);
  });
  const spoiler = page.getByRole("button", { name: /^(encrypted spoiler|шифрованный спойлер)$/i });
  await spoiler.hover();
  await expect(page.getByRole("tooltip")).toContainText(/server draft|серверном черновике/i);
  await spoiler.click();
  await expect(textarea).toHaveValue("Public before :::::: public after");
  await expect(textarea).toBeFocused();
  await expect
    .poll(() => textarea.evaluate((element) => [element.selectionStart, element.selectionEnd]))
    .toEqual(["Public before :::".length, "Public before :::".length]);
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).not.toBeVisible();
  // Even an empty block must stop draft persistence before any secret is typed.
  await page.waitForTimeout(1_200);
  expect(JSON.stringify(draftWrites)).not.toContain(":::");
  await textarea.pressSequentially(PROTECTED_TEXT);
  await expect(textarea).toHaveValue(`Public before :::${PROTECTED_TEXT}::: public after`);
  const checkbox = page.getByRole("checkbox", { name: /create a new key|создать новый ключ/i });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("secret-composer.png") });
  // Let the normal draft debounce elapse while the editor contains protected text.
  await page.waitForTimeout(1_200);
  expect(JSON.stringify(draftWrites)).not.toContain(PROTECTED_TEXT);
  await textarea.press("Enter");
  await expect
    .poll(() => requests.filter((request) => request.payload.kind === "markdown").length)
    .toBe(1);
  await expect(textarea).toHaveValue("");
  expect(requests.map((request) => request.payload.kind)).toEqual(["markdown"]);
  expect(stream.current_encryption_key_uuid).toBeNull();
  expect(JSON.stringify(requests)).not.toContain(PROTECTED_TEXT);
  const firstMarkdown = requests[0]?.payload;
  expect(firstMarkdown?.kind).toBe("markdown");
  if (firstMarkdown?.kind !== "markdown") throw new Error("Missing mixed Markdown");
  const firstKey = firstMarkdown.content.match(/urn:secret:v1:[^:]+:([^:]+):/)?.[1];
  expect(firstKey).toBeTruthy();
  expect(firstMarkdown.content).toContain("Public before");
  expect(firstMarkdown.content).toContain(`urn:secret:v1:${E2E_STREAM_UUID}:${firstKey}:`);
  expect(firstMarkdown.content).toContain("public after");
  const ready = page
    .locator("[data-workspace-message-bubble]")
    .filter({ hasText: "Public before" })
    .locator('[data-encrypted-secret-state="ready"]')
    .first();
  await expect(ready).toBeVisible();
  await expect(ready.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await ready.getByRole("button", { name: /show spoiler|показать спойлер/i }).click();
  await expect(ready).toContainText(PROTECTED_TEXT);
  await page.screenshot({ path: testInfo.outputPath("secret-readable.png") });
  await ready.getByRole("button", { name: /hide spoiler|скрыть спойлер/i }).click();
  await expect(ready.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: testInfo.outputPath("secret-hidden.png") });
  await page.reload();
  await expectReadyMessageComposer(page);
  await expect(ready).toBeVisible();
  await expect(ready.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  const multilineSecret = "another private phrase\nsecond private line";
  await selectSecret(`Second public ${multilineSecret}`, multilineSecret);
  await textarea.press("Enter");
  await expect
    .poll(() => requests.filter((request) => request.payload.kind === "markdown").length)
    .toBe(2);
  const secondMarkdown = requests.filter((request) => request.payload.kind === "markdown")[1]
    ?.payload;
  expect(secondMarkdown?.kind === "markdown" ? secondMarkdown.content : "").toContain(
    `:${firstKey}:`,
  );
  const secondReady = page
    .locator("[data-workspace-message-bubble]")
    .filter({ hasText: "Second public" })
    .locator('[data-encrypted-secret-state="ready"]');
  await secondReady.getByRole("button", { name: /show spoiler|показать спойлер/i }).click();
  await expect(secondReady).toContainText("another private phrase");
  await expect(secondReady).toContainText("second private line");
  expect(JSON.stringify(requests)).not.toContain("second private line");
  expect(requests.filter((request) => request.payload.kind === "key_announced")).toHaveLength(0);
  await selectSecret("Third public rotated private phrase", "rotated private phrase");
  await checkbox.check();
  await textarea.press("Enter");
  await expect
    .poll(() => requests.filter((request) => request.payload.kind === "markdown").length)
    .toBe(3);
  expect(requests.filter((request) => request.payload.kind === "key_announced")).toHaveLength(0);
  const thirdMarkdown = requests.filter((request) => request.payload.kind === "markdown")[2]
    ?.payload;
  expect(thirdMarkdown?.kind === "markdown" ? thirdMarkdown.content : "").not.toContain(
    `:${firstKey}:`,
  );
  expect(stream.current_encryption_key_uuid).toBeNull();
  expect(stream.encryption).toBe(false);
  await expect(ready).toBeVisible();
  await selectSecret("Retry public retry private phrase", "retry private phrase");
  await checkbox.check();
  loseNextMarkdown = true;
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("");
  await expect(
    page.locator("[data-workspace-message-bubble][data-outgoing-delivery-status='failed']"),
  ).toHaveCount(1);
  const uncertain = requests.filter((request) => request.payload.kind === "markdown").at(-1);
  const announcementsBeforeRetry = requests.filter(
    (request) => request.payload.kind === "key_announced",
  ).length;
  await textarea.fill("Next public draft remains");
  await page.getByRole("button", { name: /^(повторить отправку|retry send)$/i }).click();
  await expect
    .poll(() => requests.filter((request) => request.payload.kind === "markdown").length)
    .toBe(5);
  expect(requests.filter((request) => request.payload.kind === "markdown").at(-1)).toEqual(
    uncertain,
  );
  expect(requests.filter((request) => request.payload.kind === "key_announced")).toHaveLength(
    announcementsBeforeRetry,
  );
  await expect(page.locator("[data-outgoing-message-id]")).toHaveCount(0);
  await expect(textarea).toHaveValue("Next public draft remains");
  // Delete through the production action so the live session publishes its own notification.
  await page
    .getByRole("button", { name: /^(channel info|информация о канале)$/i })
    .first()
    .click();
  await page.getByRole("button", { name: /^(encryption keys|ключи шифрования)$/i }).click();
  const drawer = page.locator("[data-encrypted-chat-screen='key']");
  await drawer
    .getByRole("button", { name: /Keys on this device \(3\)|Ключи на этом устройстве \(3\)/i })
    .click();
  if (!firstKey) throw new Error("Missing original key");
  await drawer.getByRole("button", { name: new RegExp(firstKey) }).click();
  const detail = page.locator("[data-encrypted-chat-screen='local-key']");
  await detail
    .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
    .click();
  await expect(
    drawer.getByRole("button", {
      name: /Keys on this device \(2\)|Ключи на этом устройстве \(2\)/i,
    }),
  ).toBeVisible();
  await expect(ready).toHaveCount(0);
  const locked = page.locator('[data-encrypted-secret-state="missing-key"]').first();
  await expect(locked).toBeVisible();
  await expect(
    page.locator("[data-workspace-message-bubble]").getByText(/Public before/),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("secret-locked.png") });
  await locked.getByRole("button", { name: /request.*key|запросить ключ/i }).click();
  await expect
    .poll(() => requests.filter((request) => request.payload.kind === "key_request").length)
    .toBe(1);
  expect(requests.at(-1)?.payload).toMatchObject({
    kind: "key_request",
    key_uuid: firstKey,
  });
  expect(requests.at(-1)?.payload).not.toHaveProperty("target_message_uuid");
  expect(JSON.stringify(draftWrites)).not.toContain(PROTECTED_TEXT);
  expect(JSON.stringify(draftWrites)).not.toContain("unfinished private phrase");
  expect(JSON.stringify(draftWrites)).not.toContain("second private line");
});
