import type { Locator, Page } from "@playwright/test";
import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { openStreamChatWithComposer } from "./helpers/navigate-messenger";
import {
  E2E_MESSAGE_UUID,
  E2E_PROJECT_ID,
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_USER_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

const QUICK_ACTIONS = "[data-workspace-message-quick-actions]";
const REPLY_ACTION = "[data-workspace-message-quick-action='reply']";
const REACTION_ACTION = "[data-workspace-message-quick-action='reaction']";
const REACTION_UUID = "88888888-8888-4888-8888-888888888888";
const ENCRYPTED_KEY_UUID = "77777777-7777-4777-8777-777777777777";
const ENCRYPTED_MESSAGE_TEXT = "Readable encrypted quick actions";

async function installDecryptedMessage(page: Page): Promise<void> {
  const content = await page.evaluate(
    async ({ streamUuid, keyUuid, plaintext }) => {
      const { useWorkspaceAuthStore } =
        await import("/src/entities/workspace-auth/workspace-auth.model.ts");
      const { ensureChatDeviceIdentity, realChatKeyStorage, realChatCryptoProvider } =
        await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
      const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
      if (runtime == null) throw new Error("Missing test runtime");
      const device = await ensureChatDeviceIdentity(runtime, () => true);
      const key = await realChatCryptoProvider.createGroupKey();
      if (!key.ok) throw new Error("Key creation failed");
      await realChatKeyStorage.writeChatKey(
        { owner: runtime, deviceId: device.deviceId, streamUuid, keyUuid },
        { groupKey: key.value },
      );
      const encrypted = await realChatCryptoProvider.encryptMessage({
        groupKey: key.value,
        plaintext: new TextEncoder().encode(plaintext),
        context: { streamUuid, keyUuid },
      });
      if (!encrypted.ok) throw new Error("Encryption failed");
      return btoa(String.fromCharCode(...encrypted.value.bytes));
    },
    {
      streamUuid: E2E_STREAM_UUID,
      keyUuid: ENCRYPTED_KEY_UUID,
      plaintext: ENCRYPTED_MESSAGE_TEXT,
    },
  );
  const stream = {
    ...streamsSuccess()[0],
    encryption: true,
    current_encryption_key_uuid: ENCRYPTED_KEY_UUID,
  };
  type EncryptedTestMessage = Omit<ReturnType<typeof messageSuccess>, "payload"> & {
    payload: Record<string, string>;
  };
  const history: EncryptedTestMessage[] = [
    {
      ...messageSuccess(""),
      payload: { kind: "e2ee", key_uuid: ENCRYPTED_KEY_UUID, content },
    },
  ];
  await page.route(/\/messenger\/streams\/?(?:[^?]*)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    await route.fulfill({ json: path.endsWith("/streams") ? [stream] : stream });
  });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      const unreadOnly = new URL(route.request().url()).searchParams.get("read") === "false";
      return route.fulfill({ json: unreadOnly ? [] : history });
    }
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as {
      uuid: string;
      payload: Record<string, string>;
    };
    const created = {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: body.payload,
    };
    history.push(created);
    await route.fulfill({ status: 201, json: created });
  });
}

async function installReactionMutationMock(page: Page): Promise<void> {
  await page.route(/\/messenger\/message_reactions\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        uuid: REACTION_UUID,
        project_id: E2E_PROJECT_ID,
        message_uuid: E2E_MESSAGE_UUID,
        user_uuid: E2E_USER_UUID,
        emoji_name: (route.request().postDataJSON() as { emoji_name: string }).emoji_name,
        created_at: "2026-10-15T10:00:00.000Z",
        updated_at: "2026-10-15T10:00:00.000Z",
      }),
    });
  });
}

const PREVIOUS_MESSAGE_UUID = "66666666-6666-4666-8666-666666666666";

async function installNarrowMessages(page: Page, owner: "own" | "peer"): Promise<void> {
  await page.setViewportSize({ width: 900, height: 844 });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const query = new URL(route.request().url()).searchParams;
    const messages = [
      messageSuccess("First short message", PREVIOUS_MESSAGE_UUID),
      {
        ...messageSuccess(
          "Second message with enough text to wrap onto multiple lines in a narrow chat.",
        ),
        created_at: "2026-07-16T10:01:00.000Z",
        updated_at: "2026-07-16T10:01:00.000Z",
      },
    ].map((message) =>
      owner === "own"
        ? message
        : {
            ...message,
            author_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            is_own: false,
          },
    );
    const items = query.get("read") === "false" ? [] : messages;
    if (query.get("sort_dir") === "desc") items.reverse();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(items),
    });
  });
}

async function expectActionsHidden(actions: Locator): Promise<void> {
  await expect(actions).toHaveCSS("opacity", "0");
  await expect(actions).toHaveCSS("pointer-events", "none");
}

test.describe("Workspace message quick actions @mock", () => {
  test("decrypted messages expose hover reactions and send a genuinely encrypted quick reply", async ({
    authenticated: page,
  }) => {
    await installDecryptedMessage(page);
    await installReactionMutationMock(page);
    await openStreamChatWithComposer(page);
    const row = page.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const bubble = row.locator("[data-workspace-message-bubble='true']");
    const actions = row.locator(QUICK_ACTIONS);
    await expect(bubble).toContainText(ENCRYPTED_MESSAGE_TEXT);
    await expect(bubble).not.toHaveAttribute("data-encrypted-message-locked", "true");
    await page.mouse.move(0, 0);
    await expectActionsHidden(actions);
    await bubble.hover();
    await expect(actions).toHaveCSS("opacity", "1");
    await expect(row.locator(REPLY_ACTION)).toBeVisible();
    await row.locator(REACTION_ACTION).hover();
    const panel = row.locator("[data-workspace-message-quick-reactions='true']");
    await expect(panel).toHaveAttribute("data-expanded", "true");
    const reaction = page.waitForRequest(
      (request) => request.method() === "POST" && /\/message_reactions\/?$/.test(request.url()),
    );
    await panel.locator("[data-workspace-message-quick-reaction='👍']").click();
    expect((await reaction).postDataJSON()).toEqual({
      message_uuid: E2E_MESSAGE_UUID,
      emoji_name: "👍",
    });
    await expect(row.locator("[data-workspace-message-reaction-chip='true']")).toContainText("👍");
    await bubble.hover();
    await row.locator(REPLY_ACTION).click();
    const quote = page.locator("[data-composer-reply-quote='true']");
    await expect(quote).toBeVisible();
    const answer = "Encrypted answer from hover reply";
    const composer = await expectReadyMessageComposer(page);
    await composer.fill(answer);
    const sent = page.waitForRequest(
      (request) => request.method() === "POST" && /\/messenger\/messages\/?$/.test(request.url()),
    );
    await page
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();
    const request = await sent;
    const payload = request.postDataJSON() as {
      payload: { kind: string; key_uuid: string; content: string };
    };
    expect(payload.payload.kind).toBe("e2ee");
    expect(payload.payload.key_uuid).toBe(ENCRYPTED_KEY_UUID);
    expect(request.postData()).not.toContain(ENCRYPTED_MESSAGE_TEXT);
    expect(request.postData()).not.toContain(answer);
    expect(request.postData()).not.toContain("urn:quote:");
    const decrypted = await page.evaluate(
      async ({ streamUuid, keyUuid, content }) => {
        const { useWorkspaceAuthStore } =
          await import("/src/entities/workspace-auth/workspace-auth.model.ts");
        const { realChatKeyStorage, realChatCryptoProvider } =
          await import("/src/entities/messenger/chat-crypto-resources.lib.ts");
        const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
        if (runtime == null) throw new Error("Missing test runtime");
        const device = await realChatKeyStorage.readDeviceIdentity(runtime);
        if (device == null) throw new Error("Missing test device");
        const key = await realChatKeyStorage.readChatKey({
          owner: runtime,
          deviceId: device.deviceId,
          streamUuid,
          keyUuid,
        });
        if (key?.groupKey == null) throw new Error("Missing test key");
        const result = await realChatCryptoProvider.decryptMessage({
          groupKey: key.groupKey,
          envelope: {
            bytes: Uint8Array.from(atob(content), (character) => character.charCodeAt(0)),
          },
          context: { streamUuid, keyUuid },
        });
        if (!result.ok) throw new Error("Submitted reply decryption failed");
        return new TextDecoder().decode(result.value);
      },
      {
        streamUuid: E2E_STREAM_UUID,
        keyUuid: ENCRYPTED_KEY_UUID,
        content: payload.payload.content,
      },
    );
    expect(decrypted).toContain(`urn:quote:${E2E_MESSAGE_UUID}`);
    expect(decrypted).toContain(answer);
    await expect(composer).toHaveValue("");
    await expect(quote).toHaveCount(0);
  });

  test("removing a decrypted message key replaces hover actions with the persistent key request", async ({
    authenticated: page,
  }) => {
    await installDecryptedMessage(page);
    await openStreamChatWithComposer(page);
    const row = page.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const bubble = row.locator("[data-workspace-message-bubble='true']");
    await expect(bubble).toContainText(ENCRYPTED_MESSAGE_TEXT);
    await bubble.hover();
    await expect(row.locator(REPLY_ACTION)).toBeVisible();
    await page
      .getByRole("button", { name: /^(channel info|информация о канале)$/i })
      .first()
      .click();
    await page.getByRole("button", { name: /^(settings|настройки)$/i }).click();
    await page.getByRole("button", { name: /^(encryption keys|ключи шифрования)$/i }).click();
    const drawer = page.locator("[data-encrypted-chat-screen='key']");
    await drawer
      .getByRole("button", { name: /Keys on this device \(1\)|Ключи на этом устройстве \(1\)/i })
      .click();
    await drawer.getByRole("button", { name: new RegExp(ENCRYPTED_KEY_UUID) }).click();
    const detail = page.locator("[data-encrypted-chat-screen='local-key']");
    await detail
      .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^(delete from this device|удалить с этого устройства)$/i })
      .click();
    await expect(bubble).toHaveAttribute("data-encrypted-message-locked", "true");
    await expect(bubble).not.toContainText(ENCRYPTED_MESSAGE_TEXT);
    await expect(row.locator(REPLY_ACTION)).toHaveCount(0);
    await expect(row.locator(REACTION_ACTION)).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(row.locator(QUICK_ACTIONS)).toHaveCSS("opacity", "1");
    await expect(
      row.locator("[data-workspace-message-quick-action='request-message-key']"),
    ).toBeVisible();
  });

  test("reveals actions on hover and keyboard focus, and sends a reply to the message", async ({
    authenticated,
  }, testInfo) => {
    await openStreamChatWithComposer(authenticated);
    const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const bubble = row.locator("[data-workspace-message-bubble='true']");
    const actions = row.locator(QUICK_ACTIONS);
    await expect(actions).toBeAttached();
    await authenticated.mouse.move(0, 0);
    await expectActionsHidden(actions);

    await bubble.hover();
    await expect(actions).toHaveCSS("opacity", "1");
    await expect(actions.locator(REPLY_ACTION)).toBeVisible();
    await expect(actions.locator(REPLY_ACTION)).toHaveText(/ответить|reply/i);
    await expect(actions.locator(REACTION_ACTION)).toBeVisible();
    const hoverScreenshotPath = testInfo.outputPath("message-quick-actions-hover.png");
    await row.screenshot({ path: hoverScreenshotPath });
    await testInfo.attach("message-quick-actions-hover", {
      path: hoverScreenshotPath,
      contentType: "image/png",
    });

    await authenticated.mouse.move(0, 0);
    await expectActionsHidden(actions);
    await actions.locator(REPLY_ACTION).focus();
    await expect(actions.locator(REPLY_ACTION)).toBeFocused();
    await expect(actions).toHaveCSS("opacity", "1");
    await authenticated.keyboard.press("Enter");

    const quote = authenticated.locator("[data-composer-reply-quote='true']");
    await expect(quote).toContainText("E2E initial message");
    const composer = await expectReadyMessageComposer(authenticated);
    await composer.fill("Answer from the quick reply action");
    const sent = authenticated.waitForRequest(
      (request) => request.method() === "POST" && /\/messenger\/messages\/?$/.test(request.url()),
    );
    await authenticated
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();
    const payload = (await sent).postDataJSON() as { payload?: { content?: string } };
    expect(payload.payload?.content).toContain(`urn:quote:${E2E_MESSAGE_UUID}`);
    expect(payload.payload?.content).toContain("Answer from the quick reply action");
    await expect(composer).toHaveValue("");
    await expect(quote).toHaveCount(0);
  });

  test("adds the collapsed first reaction and removes it from the expanded list through the Workspace API", async ({
    authenticated,
  }) => {
    await installReactionMutationMock(authenticated);
    await openStreamChatWithComposer(authenticated);
    const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
    const heart = row.locator(REACTION_ACTION);
    const firstGlyph = await heart.getAttribute("data-workspace-message-quick-reaction");
    if (firstGlyph == null) throw new Error("First reaction glyph is unavailable");
    await row.locator("[data-workspace-message-bubble='true']").hover();
    const added = authenticated.waitForRequest(
      (request) => request.method() === "POST" && /\/message_reactions\/?$/.test(request.url()),
    );
    await heart.click();
    expect((await added).postDataJSON()).toEqual({
      message_uuid: E2E_MESSAGE_UUID,
      emoji_name: firstGlyph,
    });
    const chip = row.locator("[data-workspace-message-reaction-chip='true']");
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toHaveAttribute("data-workspace-message-reaction-pending", "false");
    await expect(chip).toContainText(firstGlyph);

    // The reaction footer changes bubble dimensions and moves its corner action.
    await row.locator("[data-workspace-message-bubble='true']").hover();
    await heart.hover();
    await expect(row.locator("[data-workspace-message-quick-reactions='true']")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    const removed = authenticated.waitForRequest(
      (request) =>
        request.method() === "DELETE" &&
        new URL(request.url()).pathname.endsWith(`/message_reactions/${REACTION_UUID}`),
    );
    await heart.click();
    await removed;
    await expect(chip).toHaveCount(0);
  });

  for (const owner of ["own", "peer"] as const) {
    test(`opens the ${owner} scrollable reaction capsule on hover and applies a selected emoji`, async ({
      authenticated,
    }, testInfo) => {
      await installNarrowMessages(authenticated, owner);
      await installReactionMutationMock(authenticated);
      await openStreamChatWithComposer(authenticated);
      const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
      const bubble = row.locator("[data-workspace-message-bubble='true']");
      await bubble.click({ button: "right" });
      const menu = authenticated.locator("[data-menu-source='context'][data-menu-open='true']");
      await expect(menu).toBeVisible();
      const expectedReactionOrder = await menu
        .locator("[data-workspace-message-quick-reaction]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-workspace-message-quick-reaction")),
        );
      expect(expectedReactionOrder).toHaveLength(6);
      await authenticated.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await bubble.hover();
      await row.locator(REACTION_ACTION).hover();
      const panel = row.locator("[data-workspace-message-quick-reactions='true']");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-expanded", "true");
      await expect.poll(async () => (await panel.boundingBox())?.width).toBe(40);
      const scroll = panel.locator("[data-workspace-message-quick-reaction-scroll='true']");
      const options = scroll.locator("[data-workspace-message-quick-reaction]");
      await expect(options).toHaveCount(expectedReactionOrder.length);
      await expect(panel.locator("button")).toHaveCount(expectedReactionOrder.length);
      expect(
        await options.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-workspace-message-quick-reaction")),
        ),
      ).toEqual(expectedReactionOrder);
      const first = options.first();
      await expect(first).toHaveAttribute("data-workspace-message-quick-action", "reaction");
      await expect(scroll.locator(REACTION_ACTION)).toHaveCount(1);
      const panelBounds = await panel.boundingBox();
      if (panelBounds == null) throw new Error("Reaction panel bounds are unavailable");
      const metrics = await scroll.evaluate((element) => {
        const style = getComputedStyle(element);
        const scrollbar = getComputedStyle(element, "::-webkit-scrollbar");
        return {
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollbarHidden: style.scrollbarWidth === "none" || scrollbar.display === "none",
        };
      });
      expect(panelBounds.height).toBeLessThanOrEqual(176);
      expect(panelBounds.width).toBeLessThanOrEqual(48);
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
      expect(metrics.scrollbarHidden).toBe(true);
      await scroll.hover();
      await authenticated.mouse.wheel(0, 600);
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect
        .poll(() =>
          first.evaluate((element) => {
            const viewport = element.closest("[data-workspace-message-quick-reaction-scroll]");
            return (
              element.getBoundingClientRect().bottom - (viewport?.getBoundingClientRect().top ?? 0)
            );
          }),
        )
        .toBeLessThanOrEqual(0);
      await authenticated.mouse.wheel(0, -600);
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
      await expect(first).toBeInViewport({ ratio: 1 });
      const screenshotPath = testInfo.outputPath(`message-reaction-list-${owner}.png`);
      await authenticated.screenshot({ path: screenshotPath });
      await testInfo.attach(`message-reaction-list-${owner}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      const added = authenticated.waitForRequest(
        (request) => request.method() === "POST" && /\/message_reactions\/?$/.test(request.url()),
      );
      await panel.locator("[data-workspace-message-quick-reaction='👍']").click();
      expect((await added).postDataJSON()).toEqual({
        message_uuid: E2E_MESSAGE_UUID,
        emoji_name: "👍",
      });
      const chip = row.locator("[data-workspace-message-reaction-chip='true']");
      await expect(chip).toHaveCount(1);
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      await expect(chip).toHaveAttribute("data-workspace-message-reaction-pending", "false");
      await expect(chip).toContainText("👍");
    });

    test(`keeps ${owner} quick actions inside a narrow chat without covering the preceding message`, async ({
      authenticated,
    }, testInfo) => {
      await installNarrowMessages(authenticated, owner);
      await openStreamChatWithComposer(authenticated);
      const previousBubble = authenticated.locator(
        `[data-message-uuid='${PREVIOUS_MESSAGE_UUID}'] [data-workspace-message-bubble='true']`,
      );
      const row = authenticated.locator(`[data-message-uuid='${E2E_MESSAGE_UUID}']`);
      const bubble = row.locator("[data-workspace-message-bubble='true']");
      await bubble.hover();
      const actions = row.locator(QUICK_ACTIONS);
      await expect(actions).toHaveCSS("opacity", "1");
      const reply = actions.locator(REPLY_ACTION);
      const reaction = actions.locator(REACTION_ACTION);
      await expect(reply).toHaveText(/ответить|reply/i);
      const narrowScreenshotPath = testInfo.outputPath("message-quick-actions-narrow.png");
      await authenticated.screenshot({ path: narrowScreenshotPath });
      await testInfo.attach("message-quick-actions-narrow", {
        path: narrowScreenshotPath,
        contentType: "image/png",
      });
      const replyBounds = await reply.boundingBox();
      const reactionBounds = await reaction.boundingBox();
      const bubbleBounds = await bubble.boundingBox();
      const previousBounds = await previousBubble.boundingBox();
      const mainBounds = await authenticated.locator("main").boundingBox();
      if (
        replyBounds == null ||
        reactionBounds == null ||
        bubbleBounds == null ||
        previousBounds == null ||
        mainBounds == null
      )
        throw new Error("Message bounds are unavailable");
      for (const bounds of [replyBounds, reactionBounds]) {
        expect(bounds.x).toBeGreaterThanOrEqual(mainBounds.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(mainBounds.x + mainBounds.width);
        expect(bounds.y).toBeGreaterThanOrEqual(previousBounds.y + previousBounds.height);
      }
      expect(replyBounds.y).toBeLessThan(bubbleBounds.y);
      expect(replyBounds.y + replyBounds.height).toBeLessThanOrEqual(bubbleBounds.y + 8);
      expect(reactionBounds.y + reactionBounds.height / 2).toBeGreaterThan(
        bubbleBounds.y + bubbleBounds.height / 2,
      );
      expect(reactionBounds.y).toBeLessThanOrEqual(bubbleBounds.y + bubbleBounds.height);
      expect(reactionBounds.height).toBeLessThan(replyBounds.height);
      const reactionCenter = reactionBounds.x + reactionBounds.width / 2;
      if (owner === "own") {
        expect(reactionCenter).toBeLessThanOrEqual(bubbleBounds.x);
      } else {
        expect(reactionCenter).toBeGreaterThanOrEqual(bubbleBounds.x + bubbleBounds.width);
      }
    });
  }
});
