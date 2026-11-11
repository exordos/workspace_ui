import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Locator } from "@playwright/test";

interface AvatarFixtures {
  topicPath: string;
  users: { login: string; name: string; uuid: string }[];
  polls: {
    question: string;
    messageUuid: string;
    questionUuid: string;
    optionUuid: string;
    optionText: string;
    votes: number;
  }[];
}

const stand = process.env.POLL_STAND_URL;
const fixturePath = process.env.POLL_AVATAR_FIXTURE;
test.skip(!stand || !fixturePath, "Requires the local avatar seed and POLL_STAND_URL.");
const fixtures: AvatarFixtures | undefined = fixturePath
  ? JSON.parse(readFileSync(fixturePath, "utf8"))
  : undefined;

async function loginToken(request: APIRequestContext, login: string) {
  const response = await request.post(
    `${stand}/api/core/v1/iam/clients/default/actions/get_token/invoke`,
    {
      data: {
        grant_type: "login+password",
        login,
        password: login,
        scope: "openid profile email project:fe02e55d-4548-4b3e-a175-fcae928f41b2",
      },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json()).access_token as string;
}

async function avatarNames(option: Locator) {
  return option
    .locator(".avatar-group-item")
    .evaluateAll((items) => items.map((item) => item.getAttribute("title")));
}

async function previewNames(
  request: APIRequestContext,
  headers: Record<string, string>,
  messageUuid: string,
  questionUuid: string,
  optionUuid: string,
) {
  const response = await request.get(
    `${stand}/workspace/v1/messenger/messages/${messageUuid}/poll_voters/`,
    { headers, params: { question_uuid: questionUuid, option_uuid: optionUuid, page_limit: 5 } },
  );
  expect(response.ok()).toBe(true);
  const voters: { uuid: string }[] = await response.json();
  return voters.map(({ uuid }) => fixtures!.users.find((user) => user.uuid === uuid)?.name);
}

test("avatar stacks cap at five while counts and the voter list retain every vote @live", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(stand!).hostname);
  await page.goto(stand!);
  const server = page.locator("#realm");
  await expect(server.or(page.locator("#username"))).toBeVisible();
  if (await server.isVisible()) {
    await server.fill(stand!);
    await page.getByRole("button", { name: /^(далее|next)$/i }).click();
  }
  await page.locator("#username").fill("alice");
  await page.locator("#password").fill("alice");
  await page.locator("form button[type=submit]").click();
  await expect(page.locator("#projectId")).toContainText("Workspace Test");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("link", { name: "Test Lab", exact: true })).toBeVisible();
  await page.goto(new URL(fixtures!.topicPath, stand).href);
  const tokens = await Promise.all(fixtures!.users.map((user) => loginToken(request, user.login)));
  const headers = { Authorization: `Bearer ${tokens[0]}` };

  for (const fixture of fixtures!.polls) {
    const poll = page.getByTestId("workspace-message-poll").filter({ hasText: fixture.question });
    const section = poll.getByRole("group", { name: fixture.question, exact: true });
    const option = section.locator(".workspace-poll-option").filter({
      has: page.getByRole("button", { name: fixture.optionText, exact: true }),
    });
    await expect(option.locator(".avatar-group-item")).toHaveCount(Math.min(fixture.votes, 5));
    const expected = await previewNames(
      request,
      headers,
      fixture.messageUuid,
      fixture.questionUuid,
      fixture.optionUuid,
    );
    await expect.poll(() => avatarNames(option)).toEqual(expected);
    await expect(option.locator(".workspace-poll-option-aggregate")).toContainText(
      `· ${fixture.votes}`,
    );
    const rectangles = await option.locator(".avatar-group-item").evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    );
    for (let index = 1; index < rectangles.length; index++) {
      expect(rectangles[index]!.left).toBeGreaterThan(rectangles[index - 1]!.left);
      expect(rectangles[index]!.left).toBeLessThan(rectangles[index - 1]!.right);
    }
    if (fixture.votes === 10) {
      await option.scrollIntoViewIfNeeded();
      await expect
        .poll(async () =>
          option
            .locator(".avatar-group-item img")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every(
                  (image) =>
                    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
                ),
            ),
        )
        .toBe(true);
      await option.screenshot({ path: testInfo.outputPath("ten-votes-five-avatars.png") });
      await option.getByRole("button", { name: /кто выбрал|who chose/i }).click();
      const dialog = page.getByRole("dialog");
      for (const user of fixtures!.users) {
        await expect(dialog.getByText(user.name, { exact: true })).toBeVisible();
      }
      await page.keyboard.press("Escape");
    }
  }

  const original = fixtures!.polls[0]!;
  const originalResponse = await request.get(
    `${stand}/workspace/v1/messenger/messages/${original.messageUuid}`,
    { headers },
  );
  expect(originalResponse.ok()).toBe(true);
  const target = await originalResponse.json();
  const question = `Live avatar accumulation · ${randomUUID()}`;
  const questionUuid = randomUUID();
  const optionUuid = randomUUID();
  const createResponse = await request.post(`${stand}/workspace/v1/messenger/messages/`, {
    headers,
    data: {
      stream_uuid: target.stream_uuid,
      topic_uuid: target.topic_uuid,
      payload: {
        kind: "poll",
        multiple_answers: false,
        is_anonymous: false,
        allow_revote: true,
        results_visibility: "always",
        questions: [
          {
            uuid: questionUuid,
            text: question,
            options: [
              { uuid: optionUuid, text: "Observe avatars" },
              { uuid: randomUUID(), text: "Other" },
            ],
          },
        ],
      },
    },
  });
  expect(createResponse.status()).toBe(201);
  const message = await createResponse.json();
  const poll = page.getByTestId("workspace-message-poll").filter({ hasText: question });
  const option = poll.locator(".workspace-poll-option").filter({ hasText: "Observe avatars" });
  await expect(poll).toBeVisible();
  for (const [index, token] of tokens.entries()) {
    const response = await request.post(
      `${stand}/workspace/v1/messenger/messages/${message.uuid}/actions/vote/invoke`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { question_uuid: questionUuid, option_uuid: optionUuid, selected: true },
      },
    );
    expect(response.ok()).toBe(true);
    const expectedNames = await previewNames(
      request,
      headers,
      message.uuid,
      questionUuid,
      optionUuid,
    );
    await expect.poll(() => avatarNames(option)).toEqual(expectedNames);
    await expect(option.locator(".workspace-poll-option-aggregate")).toContainText(
      `· ${index + 1}`,
    );
  }
  const withdraw = await request.post(
    `${stand}/workspace/v1/messenger/messages/${message.uuid}/actions/vote/invoke`,
    {
      headers: { Authorization: `Bearer ${tokens[9]}` },
      data: { question_uuid: questionUuid, option_uuid: optionUuid, selected: false },
    },
  );
  expect(withdraw.ok()).toBe(true);
  const remaining = await previewNames(request, headers, message.uuid, questionUuid, optionUuid);
  await expect.poll(() => avatarNames(option)).toEqual(remaining);
  await expect(option.locator(".workspace-poll-option-aggregate")).toContainText("· 9");
  await page.reload();
  await expect.poll(() => avatarNames(option)).toEqual(remaining);

  for (const selected of [false, true]) {
    const response = await request.post(
      `${stand}/workspace/v1/messenger/messages/${message.uuid}/actions/vote/invoke`,
      {
        headers,
        data: { question_uuid: questionUuid, option_uuid: optionUuid, selected },
      },
    );
    expect(response.ok()).toBe(true);
    const voters = await previewNames(request, headers, message.uuid, questionUuid, optionUuid);
    await expect.poll(() => avatarNames(option)).toEqual(voters);
  }
  await expect(option.locator(".workspace-poll-option-aggregate")).toContainText("· 9");
});
