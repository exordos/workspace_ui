import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Run against the seeded local Workspace Test stand (Alice, Bob and Test Lab).
const stand = process.env.POLL_STAND_URL;
test.skip(!stand, "Set POLL_STAND_URL to the local poll stand origin.");

async function enterTestLab(page: Page, name: "alice" | "bob") {
  const url = new URL(stand!);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  await page.goto(url.origin);
  const server = page.locator("#realm");
  await expect(server.or(page.locator("#username"))).toBeVisible();
  if (await server.isVisible()) {
    await server.fill(url.origin);
    await page.getByRole("button", { name: /^(далее|next)$/i }).click();
  }
  await page.locator("#username").fill(name);
  await page.locator("#password").fill(name);
  await page.locator("form button[type=submit]").click();
  await expect(page.locator("#projectId")).toContainText("Workspace Test");
  await page.locator("form button[type=submit]").click();
  await page.getByRole("link", { name: "Test Lab", exact: true }).click();
  await page.getByRole("link", { name: /General Topic/i }).click();
  await expect(page.getByRole("button", { name: /создать опрос|create poll/i })).toBeVisible();
}

function findPoll(page: Page, question: string) {
  return page.getByTestId("workspace-message-poll").filter({ hasText: question });
}

async function draftPoll(page: Page, question: string) {
  await page.getByRole("button", { name: /создать опрос|create poll/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/введите вопрос|enter a question/i).fill(question);
  const answers = dialog.getByPlaceholder(/добавить ответ|add an answer/i);
  await answers.nth(0).fill("Tuesday");
  await answers.nth(1).fill("Friday");
  return dialog;
}

async function publishPoll(page: Page, dialog: Locator) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/messenger\/messages\/?$/.test(new URL(response.url()).pathname),
  );
  await dialog.getByRole("button", { name: /^(создать|create)$/i }).click();
  expect((await created).status()).toBe(201);
  await expect(dialog).toBeHidden();
}

test("public poll syncs two voters, author settings and closure @live", async ({
  page,
  browser,
}) => {
  const bobPage = await browser.newPage();
  try {
    await Promise.all([enterTestLab(page, "alice"), enterTestLab(bobPage, "bob")]);
    const question = `Team meeting? ${randomUUID()}`;
    const dialog = await draftPoll(page, question);
    await publishPoll(page, dialog);
    const alice = findPoll(page, question);
    const bob = findPoll(bobPage, question);
    await expect(bob).toBeVisible();
    await expect(bob.getByText(/результаты после голосования|results after voting/i)).toBeVisible();
    await bob.getByRole("button", { name: "Friday", exact: true }).click();
    await expect(bob.getByRole("button", { name: "Friday", pressed: true })).toBeVisible();
    await expect(alice.getByRole("button", { name: "Friday", pressed: false })).toBeVisible();
    await alice.getByRole("button", { name: "Tuesday", exact: true }).click();
    for (const poll of [alice, bob]) {
      await expect(poll.getByText(/(?:2 участника|2 participants)/i)).toBeVisible();
      await expect(poll.getByText("50%", { exact: true })).toHaveCount(2);
    }
    await alice.click({ button: "right" });
    await page.getByRole("menuitem", { name: /настройки опроса|poll settings/i }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /добавить вопрос|add question/i })).toHaveCount(
      0,
    );
    await dialog
      .getByRole("switch", { name: /разрешить добавление вариантов|allow adding options/i })
      .click();
    await dialog.getByRole("button", { name: /^(сохранить|save)$/i }).click();
    const newOption = bob.getByRole("textbox", { name: /новый вариант|new option/i });
    await newOption.fill("Monday");
    await newOption.press("Enter");
    await expect(alice.getByRole("button", { name: "Monday", exact: true })).toBeVisible();

    await alice.click({ button: "right" });
    const close = /завершить опрос|close poll/i;
    await page.getByRole("menuitem", { name: close }).click();
    await dialog.getByRole("button", { name: /^(отмена|cancel)$/i }).click();
    await expect(alice.getByText(/опрос завершён|poll closed/i)).toHaveCount(0);
    await alice.click({ button: "right" });
    await page.getByRole("menuitem", { name: close }).click();
    await dialog.getByRole("button", { name: close }).click();
    await expect(bob.getByText(/опрос завершён|poll closed/i)).toBeVisible();
    await bobPage.reload();
    await expect(bob.getByRole("button", { name: "Friday", pressed: true })).toBeDisabled();
    await expect(bob.getByText(/(?:2 участника|2 participants)/i)).toBeVisible();
  } finally {
    await bobPage.close();
  }
});

async function chooseUpcomingDeadline(dialog: Locator, minutesAhead = 0) {
  const time = await dialog.evaluate((_, minutesAhead) => {
    // The picker works in the browser's timezone and accepts whole minutes.
    const date = new Date((Math.ceil((Date.now() + 30_000) / 60_000) + minutesAhead) * 60_000);
    return {
      timestamp: date.getTime(),
      day: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      hour: String(date.getHours()),
      minute: String(date.getMinutes()),
    };
  }, minutesAhead);
  const day = dialog.locator(`button[data-day="${time.day}"]`);
  if ((await day.count()) === 0) {
    await dialog.getByRole("button", { name: /следующий месяц|next month/i }).click();
  }
  await day.click();
  const hours = dialog.getByRole("spinbutton", { name: /^(часы|hours)$/i });
  const minutes = dialog.getByRole("spinbutton", { name: /^(минуты|minutes)$/i });
  await hours.fill(time.hour);
  await hours.press("Enter");
  await minutes.fill(time.minute);
  await minutes.press("Enter");
  return time.timestamp;
}

for (const when of ["at creation", "after voting"] as const) {
  test(`poll deadline set ${when} closes voting on both clients @live`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const bobPage = await browser.newPage();
    try {
      await Promise.all([enterTestLab(page, "alice"), enterTestLab(bobPage, "bob")]);
      const question = `Timed poll ${when} · ${randomUUID()}`;
      const dialog = await draftPoll(page, question);
      const alice = findPoll(page, question);
      const bob = findPoll(bobPage, question);
      let deadline: number;
      if (when === "at creation") {
        await dialog.getByRole("button", { name: /настройки опроса|poll settings/i }).click();
        await dialog.getByRole("button", { name: /установить срок|set a deadline/i }).click();
        deadline = await chooseUpcomingDeadline(dialog);
        await publishPoll(page, dialog);
        await alice.getByRole("button", { name: "Tuesday", exact: true }).click();
      } else {
        await publishPoll(page, dialog);
        await expect(bob).toBeVisible();
        await expect(bob.locator("time")).toHaveCount(0);
        await alice.getByRole("button", { name: "Tuesday", exact: true }).click();
        await expect(alice.getByRole("button", { name: "Tuesday", pressed: true })).toBeVisible();
        await alice.click({ button: "right" });
        await page.getByRole("menuitem", { name: /настройки опроса|poll settings/i }).click();
        await dialog.getByRole("button", { name: /установить срок|set a deadline/i }).click();
        deadline = await chooseUpcomingDeadline(dialog);
        await dialog.getByRole("button", { name: /^(сохранить|save)$/i }).click();
        await expect(dialog).toBeHidden();
      }
      const vote = bob.getByRole("button", { name: "Friday", exact: true });
      await expect(vote).toBeEnabled();
      for (const poll of [alice, bob]) {
        await expect
          .poll(async () => Date.parse((await poll.locator("time").getAttribute("datetime")) ?? ""))
          .toBe(deadline);
      }
      const closed = /опрос завершён|poll closed/i;
      const remaining = deadline - Date.now();
      expect(remaining).toBeGreaterThan(0);
      await expect(bob.getByText(closed)).toBeVisible({ timeout: remaining + 10_000 });
      expect(Date.now()).toBeGreaterThanOrEqual(deadline);
      await expect(alice.getByText(closed)).toBeVisible();
      await expect(vote).toBeDisabled();
      await bobPage.reload();
      await expect(bob.getByText(closed)).toBeVisible();
      await expect(vote).toBeDisabled();
      await expect(bob.getByText(/(?:1 участник|1 participant)/i)).toBeVisible();
    } finally {
      await bobPage.close();
    }
  });
}

test("author can extend and then remove a deadline without losing votes @live", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await enterTestLab(page, "alice");
  const question = `Optional deadline · ${randomUUID()}`;
  const dialog = await draftPoll(page, question);
  const settings = /настройки опроса|poll settings/i;
  const save = dialog.getByRole("button", { name: /^(сохранить|save)$/i });
  await dialog.getByRole("button", { name: settings }).click();
  await dialog.getByRole("switch", { name: /переголосование|revot/i }).click();
  await dialog.getByRole("button", { name: /установить срок|set a deadline/i }).click();
  const original = await chooseUpcomingDeadline(dialog);
  await publishPoll(page, dialog);
  const poll = findPoll(page, question);
  const tuesday = poll.getByRole("button", { name: "Tuesday", exact: true });
  await tuesday.click();
  await expect(tuesday).toHaveAttribute("aria-pressed", "true");

  await poll.click({ button: "right" });
  await page.getByRole("menuitem", { name: settings }).click();
  await dialog.getByRole("button", { expanded: false }).click();
  const extended = await chooseUpcomingDeadline(dialog, 5);
  await save.click();
  await expect
    .poll(async () => Date.parse((await poll.locator("time").getAttribute("datetime")) ?? ""))
    .toBe(extended);
  await poll.click({ button: "right" });
  await page.getByRole("menuitem", { name: settings }).click();
  await dialog.getByRole("button", { name: /убрать срок|remove deadline/i }).click();
  await save.click();
  await expect(poll.locator("time")).toHaveCount(0);
  await expect
    .poll(Date.now, { timeout: Math.max(0, original - Date.now()) + 10_000 })
    .toBeGreaterThan(original);
  await expect(tuesday).toBeEnabled();
  await page.reload();
  await expect(tuesday).toHaveAttribute("aria-pressed", "true");
  await expect(poll.locator("time")).toHaveCount(0);
  const friday = poll.getByRole("button", { name: "Friday", exact: true });
  await friday.click();
  await expect(friday).toHaveAttribute("aria-pressed", "true");
});

test("anonymous multiple-choice poll persists revotes @live", async ({ page }) => {
  await enterTestLab(page, "bob");
  const question = `Available days? ${randomUUID()}`;
  const dialog = await draftPoll(page, question);
  await dialog.getByRole("button", { name: /настройки опроса|poll settings/i }).click();
  for (const name of [
    /несколько ответов|multiple answers/i,
    /анонимный опрос|anonymous poll/i,
    /переголосование|revot/i,
  ]) {
    await dialog.getByRole("switch", { name }).click();
  }
  await publishPoll(page, dialog);
  const poll = findPoll(page, question);
  for (const name of ["Tuesday", "Friday"]) {
    await poll.getByRole("button", { name, exact: true }).click();
    await expect(poll.getByRole("button", { name, pressed: true })).toBeVisible();
  }
  await expect(poll.getByText("100%", { exact: true })).toHaveCount(2);
  await poll.getByRole("button", { name: "Friday", exact: true }).click();
  await expect(poll.getByRole("button", { name: "Friday", pressed: false })).toBeVisible();
  await page.reload();
  await expect(poll.getByRole("button", { name: "Tuesday", pressed: true })).toBeVisible();
  await expect(poll.getByRole("button", { name: "Friday", pressed: false })).toBeVisible();
  await expect(poll.getByText(/(?:1 участник|1 participant)/i)).toBeVisible();
  await expect(poll.getByRole("button", { name: /кто выбрал|who chose/i })).toHaveCount(0);
});

test("quiz grades each question independently and locks single-choice votes @live", async ({
  page,
}) => {
  await enterTestLab(page, "alice");
  const question = `Which day comes first? ${randomUUID()}`;
  const dialog = await draftPoll(page, question);
  await dialog.getByRole("checkbox", { name: /: Tuesday$/ }).check();
  await dialog.getByRole("button", { name: /добавить вопрос|add question/i }).click();
  const second = dialog.getByRole("region", { name: /^(вопрос|question) 2$/i });
  await second
    .getByPlaceholder(/введите вопрос|enter a question/i)
    .fill("How many days in a week?");
  const answers = second.getByPlaceholder(/добавить ответ|add an answer/i);
  await answers.nth(0).fill("Seven");
  await answers.nth(1).fill("Eight");
  await second.getByRole("checkbox", { name: /: Seven$/ }).check();
  await publishPoll(page, dialog);
  const poll = findPoll(page, question);
  await poll.getByRole("button", { name: "Friday", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: /Friday.*(неправильный|incorrect)/i, pressed: true }),
  ).toBeDisabled();
  await expect(poll.getByRole("button", { name: /Tuesday.*(правильный|correct)/i })).toBeDisabled();
  await expect(poll.getByText(/результаты после голосования|results after voting/i)).toBeVisible();
  await poll.getByRole("button", { name: "Seven", exact: true }).click();
  await expect(
    poll.getByRole("button", { name: /Seven.*(правильный|correct)/i, pressed: true }),
  ).toBeDisabled();
  await expect(poll.getByText(/(?:1 участник|1 participant)/i)).toBeVisible();
});
