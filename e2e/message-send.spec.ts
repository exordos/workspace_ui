/**
 * E2E: send message flow via composer.
 */
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  e2eOrgBasePath,
  openStreamChatWithComposer,
} from "./helpers/navigate-messenger";
import { messageSuccess } from "./mocks/workspace-default-responses";
import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";

test.describe("Message send @mock", () => {
  test.beforeEach(async ({ authenticated }) => {
    await openStreamChatWithComposer(authenticated);
  });

  test("clears composer and shows message bubble after send", async ({ authenticated }) => {
    const messageText = "E2E outbound bubble text";
    const textarea = await expectReadyMessageComposer(authenticated);
    await textarea.fill(messageText);
    await authenticated
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();

    await expect(textarea).toHaveValue("", { timeout: 10_000 });

    const main = authenticated
      .locator("[data-focus-zone='main']")
      .or(authenticated.locator("main"));
    await expect(main.getByText(messageText, { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("confirms one delayed send after a topic to stream SPA transition", async ({
    authenticated,
  }) => {
    const messageText = "E2E delayed route-continuous send";
    let markRequested: () => void = () => undefined;
    let releaseResponse: () => void = () => undefined;
    let placementUuid: string | undefined;
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await authenticated.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const requestBody = route.request().postDataJSON() as {
        uuid?: unknown;
        payload?: { content?: unknown };
      };
      if (typeof requestBody.uuid !== "string") {
        throw new Error("Expected the delayed send to include a canonical message UUID");
      }

      placementUuid = createMessengerPlacementUuid(E2E_TOPIC_UUID, requestBody.uuid);
      markRequested();
      await released;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ...messageSuccess(
            typeof requestBody.payload?.content === "string"
              ? requestBody.payload.content
              : messageText,
          ),
          uuid: placementUuid,
        }),
      });
    });

    const textarea = await expectReadyMessageComposer(authenticated);
    await textarea.fill(messageText);
    await authenticated
      .getByRole("form", { name: /поле ввода сообщения|message composer/i })
      .getByRole("button")
      .last()
      .click();
    await requested;

    const optimisticRow = authenticated
      .locator("[data-message-kind='outgoing']")
      .filter({ hasText: messageText });
    await expect(optimisticRow).toHaveCount(1);
    await expect(
      optimisticRow.locator("span[data-outgoing-delivery-status='sending']"),
    ).toBeVisible();

    const streamPath = `${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}`;
    const topicPath = `${streamPath}/topic/${E2E_TOPIC_UUID}`;
    await authenticated.locator(`a[href="${streamPath}"]`).first().click();
    await expect(authenticated).toHaveURL(streamPath);

    const confirmedResponse = authenticated.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/messenger\/messages\/?(?:\?.*)?$/.test(response.url()),
    );
    releaseResponse();
    expect((await confirmedResponse).status()).toBe(201);

    await authenticated.locator(`a[href="${topicPath}"]`).first().click();
    await expect(authenticated).toHaveURL(topicPath);
    if (placementUuid == null) throw new Error("Expected a derived placement UUID");

    const matchingRows = authenticated.locator("[data-message-uuid]").filter({
      hasText: messageText,
    });
    await expect(matchingRows).toHaveCount(1);
    await expect(matchingRows).toHaveAttribute("data-message-uuid", placementUuid);
    await expect(matchingRows).toHaveAttribute("data-message-kind", "server");
    await expect(
      authenticated.locator("[data-message-kind='outgoing']").filter({ hasText: messageText }),
    ).toHaveCount(0);
    await expect(authenticated.locator("[data-outgoing-delivery-status='failed']")).toHaveCount(0);
  });
});
