import type { Page, WebSocketRoute } from "@playwright/test";
import { createMessengerPlacementUuid } from "../packages/web/src/entities/messenger/messenger-message-identity.lib";
import type {
  WorkspaceMessengerCreateMessageRequestBody,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerPollPayloadDto,
} from "../packages/web/src/shared/api/messenger.types";
import { test, expect } from "./fixtures";
import { expectReadyMessageComposer } from "./helpers/message-composer";
import { e2eOrgBasePath } from "./helpers/navigate-messenger";
import {
  E2E_STREAM_UUID,
  E2E_TOPIC_UUID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
  messageSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";

async function openPollComposer(page: Page) {
  await page
    .getByRole("button", { name: /показать инструменты форматирования|show formatting tools/i })
    .click();
  await page.getByRole("button", { name: /создать опрос|create poll/i }).click();
}

test("creates and manages a poll without changing the draft @mock", async ({
  authenticated: page,
}) => {
  const requests: { action: string; body: unknown }[] = [];
  let message: WorkspaceMessengerMessageDto | null = null;
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
    requests.push({ action: "create", body });
    if (!body.uuid || body.payload.kind !== "poll") throw new Error("Expected poll");
    const question = body.payload.questions[0]!;
    message = {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: body.payload,
      poll_state: {
        revision: 1,
        is_closed: false,
        voter_count: 0,
        questions: [{ question_uuid: question.uuid, voter_count: 0, option_counts: {} }],
        my_votes: [],
      },
    };
    await route.fulfill({ status: 201, json: message });
  });
  await page.route(
    /\/messenger\/messages\/[^/]+\/actions\/(vote|update_settings|add_poll_option)\/invoke\/?$/,
    async (route) => {
      const url = route.request().url();
      const action = url.includes("/vote/")
        ? "vote"
        : url.includes("/add_poll_option/")
          ? "addOption"
          : "settings";
      const body = route.request().postDataJSON();
      requests.push({ action, body });
      if (!message || message.payload.kind !== "poll" || !message.poll_state)
        throw new Error("Missing poll");
      const payload = message.payload as WorkspaceMessengerPollPayloadDto;
      const question = payload.questions[0]!;
      if (action === "vote") {
        const option = question.options[0]!;
        message = {
          ...message,
          poll_state: {
            revision: 2,
            is_closed: false,
            voter_count: 1,
            questions: [
              { question_uuid: question.uuid, voter_count: 1, option_counts: { [option.uuid]: 1 } },
            ],
            my_votes: [{ question_uuid: question.uuid, option_uuids: [option.uuid] }],
          },
        };
      } else if (action === "settings") {
        message = {
          ...message,
          payload: { ...payload, allow_adding_options: true },
          poll_state: { ...message.poll_state, revision: 3 },
        };
      } else {
        const addition = body as { question_uuid: string; option: { uuid: string; text: string } };
        expect(addition.question_uuid).toBe(question.uuid);
        message = {
          ...message,
          payload: {
            ...payload,
            questions: [{ ...question, options: [...question.options, addition.option] }],
          },
          poll_state: { ...message.poll_state, revision: 4 },
        };
      }
      await route.fulfill({ json: message });
    },
  );
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  const textbox = await expectReadyMessageComposer(page);
  await textbox.fill("Draft remains");
  await openPollComposer(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/введите вопрос|enter a question/i).fill("Where?");
  const options = dialog.getByPlaceholder(/добавить ответ|add an answer/i);
  await options.nth(0).fill("Office");
  await options.nth(1).fill("Online");
  await dialog.getByRole("button", { name: /^(создать|create)$/i }).click();
  const poll = page.getByTestId("workspace-message-poll");
  await expect(poll.getByText("Where?")).toBeVisible();
  expect(requests[0]?.body).toMatchObject({
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    payload: {
      kind: "poll",
      multiple_answers: false,
      questions: [{ text: "Where?", options: [{ text: "Office" }, { text: "Online" }] }],
    },
  });
  await poll.getByText("Office", { exact: true }).click();
  await expect.poll(() => requests.filter((item) => item.action === "vote").length).toBe(1);
  await poll.locator("legend").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /настройки опроса|poll settings/i }).click();
  const settings = page.getByRole("dialog");
  await settings
    .getByRole("switch", { name: /разрешить добавление вариантов|allow adding options/i })
    .click();
  await settings.getByRole("button", { name: /^(сохранить|save)$/i }).click();
  await expect.poll(() => requests.filter((item) => item.action === "settings").length).toBe(1);
  expect(requests[1]?.body).toMatchObject({ selected: true });
  expect(requests[2]?.body).toEqual({ settings: { closes_at: null, allow_adding_options: true } });
  const newOption = poll.getByRole("textbox", { name: /новый вариант|new option/i });
  await newOption.fill("Cafe");
  await newOption.press("Enter");
  await expect(poll.getByRole("button", { name: "Cafe", exact: true })).toBeVisible();
  expect(requests[3]?.body).toMatchObject({ option: { text: "Cafe" } });
  await expect(textbox).toHaveValue("Draft remains");
});

test("keeps poll controls within the bubble while voting and closing @mock", async ({
  authenticated: page,
}, testInfo) => {
  if (testInfo.project.name === "mobile-chrome")
    await page.setViewportSize({ width: 360, height: 800 });
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/workspace\/v1\/events\/ws/, (socket) => {
    sockets.push(socket);
    setTimeout(
      () =>
        socket.send(
          JSON.stringify({
            type: "ready",
            epoch_generation: "e2e-generation-1",
            epoch_version: 0,
          }),
        ),
      200,
    );
  });
  let message: WorkspaceMessengerMessageDto | null = null;
  let releaseVote: (() => void) | undefined;
  let voteAttempt = 0;
  const voterRequests: string[] = [];
  const voterUuids = (count: number) =>
    Array.from(
      { length: count },
      (_, index) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
    );
  await page.route(/\/messenger\/messages\/[^/]+\/poll_voters\/?\?/, async (route) => {
    voterRequests.push(route.request().url());
    await route.fulfill({ json: [] });
  });
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
    if (!body.uuid || body.payload.kind !== "poll") throw new Error("Expected poll");
    const question = body.payload.questions[0]!;
    message = {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: { ...body.payload, allow_revote: true },
      poll_state: {
        revision: 1,
        is_closed: false,
        voter_count: 0,
        questions: [{ question_uuid: question.uuid, voter_count: 0, option_counts: {} }],
        my_votes: [],
      },
    };
    await route.fulfill({ status: 201, json: message });
  });
  await page.route(
    /\/messenger\/messages\/[^/]+\/actions\/(vote|close_poll)\/invoke\/?$/,
    async (route) => {
      if (!message || message.payload.kind !== "poll" || !message.poll_state)
        throw new Error("Missing poll");
      const question = message.payload.questions[0]!;
      const option = question.options[0]!;
      if (route.request().url().includes("/vote/")) {
        voteAttempt++;
        await new Promise<void>((resolve) => {
          releaseVote = resolve;
        });
        if (voteAttempt === 1) return route.fulfill({ status: 500, json: { error: "failed" } });
        const selected = (route.request().postDataJSON() as { selected: boolean }).selected;
        message = {
          ...message,
          poll_state: {
            ...message.poll_state,
            revision: voteAttempt === 2 ? 2 : 5,
            voter_count: selected ? 1 : 0,
            questions: [
              {
                question_uuid: question.uuid,
                voter_count: selected ? 1 : 0,
                option_counts: selected ? { [option.uuid]: 1 } : {},
                option_voter_previews: selected ? { [option.uuid]: voterUuids(1) } : undefined,
              },
            ],
            my_votes: selected
              ? [{ question_uuid: question.uuid, option_uuids: [option.uuid] }]
              : [],
          },
        };
      } else {
        message = {
          ...message,
          poll_state: { ...message.poll_state, revision: 10, is_closed: true },
        };
      }
      await route.fulfill({ json: message });
    },
  );
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await expectReadyMessageComposer(page);
  await openPollComposer(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/введите вопрос|enter a question/i).fill("Geometry?");
  const options = dialog.getByPlaceholder(/добавить ответ|add an answer/i);
  const longOption =
    "A long answer that wraps across several lines on a narrow mobile screen and remains stable when results become visible";
  await options.nth(0).fill(longOption);
  await options.nth(1).fill("Other");
  await dialog.getByRole("button", { name: /^(создать|create)$/i }).click();
  const poll = page.getByTestId("workspace-message-poll");
  const bubble = poll.locator('xpath=ancestor::*[@data-workspace-message-bubble="true"]');
  const choice = poll.getByRole("button", { name: longOption, exact: true });
  await expect(choice).toBeVisible();
  const dimensions = async () =>
    bubble.evaluate((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    });
  const initial = await dimensions();
  await expect(poll.getByText(/\d+%/)).toHaveCount(0);
  const expectFits = async () => {
    const current = await dimensions();
    expect(current.width).toBeCloseTo(initial.width, 0);
    expect(current.height).toBeGreaterThan(0);
    const overflow = await bubble.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  };
  await choice.click();
  await expect(poll.locator('fieldset[aria-busy="true"]')).toBeVisible();
  await expectFits();
  await expect.poll(() => releaseVote).toBeDefined();
  releaseVote?.();
  releaseVote = undefined;
  await expect(poll.getByRole("alert")).toBeVisible();
  await expectFits();
  await choice.click();
  await expect(poll.locator('fieldset[aria-busy="true"]')).toBeVisible();
  await expect.poll(() => releaseVote).toBeDefined();
  releaseVote?.();
  releaseVote = undefined;
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expect(poll.locator(".avatar-group-item")).toHaveCount(1);
  await expectFits();
  if (!message || message.payload.kind !== "poll" || !message.poll_state)
    throw new Error("Missing poll");
  const question = message.payload.questions[0]!;
  const option = question.options[0]!;
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  for (const count of [9, 10]) {
    message = {
      ...message,
      poll_state: {
        ...message.poll_state!,
        revision: count - 6,
        voter_count: count,
        questions: [
          {
            question_uuid: question.uuid,
            voter_count: count,
            option_counts: { [option.uuid]: count },
            option_voter_previews: { [option.uuid]: voterUuids(count) },
          },
        ],
        my_votes: [{ question_uuid: question.uuid, option_uuids: [option.uuid] }],
      },
    };
    sockets.at(-1)!.send(
      JSON.stringify({
        schema_version: 1,
        epoch_version: count - 8,
        uuid: `dddddddd-dddd-4ddd-8ddd-${String(count).padStart(12, "0")}`,
        project_id: E2E_PROJECT_ID,
        user_uuid: E2E_USER_UUID,
        object_type: "message",
        action: "updated",
        payload: { ...message, kind: "message.updated" },
        created_at: message.created_at,
        updated_at: message.updated_at,
      }),
    );
    await expect(
      poll.getByText(new RegExp(`${count} участников|${count} participants`, "i")),
    ).toBeVisible();
    await expect(poll.locator(".avatar-group-item")).toHaveCount(5);
    await expectFits();
  }
  await expectFits();
  await choice.click();
  await expect(poll.locator('fieldset[aria-busy="true"]')).toBeVisible();
  await expect.poll(() => releaseVote).toBeDefined();
  releaseVote?.();
  releaseVote = undefined;
  await expect(choice).toHaveAttribute("aria-pressed", "false");
  await expectFits();
  await expect(poll.getByText(/\d+%/)).toHaveCount(0);
  await poll.locator("legend").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /завершить опрос|close poll/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /завершить опрос|close poll/i })
    .click();
  await expect(choice).toBeDisabled();
  await expect(poll.getByText(/0%/).first()).toBeVisible();
  await expectFits();
  expect(voterRequests).toHaveLength(0);
});

test("submits a poll in an unencrypted Zulip conversation @mock", async ({
  authenticated: page,
}) => {
  await page.route(/\/messenger\/streams\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      json: streamsSuccess().map((stream) => ({ ...stream, source_name: "zulip" })),
    });
  });
  await page.reload();
  await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);
  await expectReadyMessageComposer(page);
  await openPollComposer(page);
  let created: WorkspaceMessengerCreateMessageRequestBody | null = null;
  let published: WorkspaceMessengerMessageDto | null = null;
  let closed = false;
  await page.route(/\/messenger\/messages\/?(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON() as WorkspaceMessengerCreateMessageRequestBody;
    created = body;
    if (!body.uuid || body.payload.kind !== "poll") throw new Error("Expected poll");
    const question = body.payload.questions[0]!;
    published = {
      ...messageSuccess("", createMessengerPlacementUuid(E2E_TOPIC_UUID, body.uuid)),
      payload: body.payload,
      poll_state: {
        revision: 1,
        is_closed: false,
        voter_count: 0,
        questions: [{ question_uuid: question.uuid, voter_count: 0, option_counts: {} }],
        my_votes: [],
      },
    };
    await route.fulfill({ status: 201, json: published });
  });
  await page.route(
    /\/messenger\/messages\/[^/]+\/actions\/close_poll\/invoke\/?$/,
    async (route) => {
      if (!published || published.payload.kind !== "poll")
        throw new Error("Expected published poll");
      closed = true;
      await route.fulfill({
        json: {
          ...published,
          payload: { ...published.payload, closed_at: new Date().toISOString() },
          poll_state: { ...published.poll_state!, revision: 2, is_closed: true },
        },
      });
    },
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/введите вопрос|enter a question/i).fill("Zulip round trip?");
  const options = dialog.getByPlaceholder(/добавить ответ|add an answer/i);
  await options.nth(0).fill("Office");
  await options.nth(1).fill("Online");
  await dialog.getByRole("button", { name: /^(создать|create)$/i }).click();
  await expect(dialog).toBeHidden();
  expect(created).toMatchObject({
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    payload: { kind: "poll", questions: [{ text: "Zulip round trip?" }] },
  });
  await expect(
    page.getByTestId("workspace-message-poll").getByText("Zulip round trip?"),
  ).toBeVisible();
  await page.getByTestId("workspace-message-poll").click({ button: "right" });
  await page.getByRole("menuitem", { name: /завершить опрос|close poll/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /завершить опрос|close poll/i })
    .click();
  expect(closed).toBe(true);
  await expect(
    page.getByTestId("workspace-message-poll").getByText(/опрос завершён|poll closed/i),
  ).toBeVisible();
});
