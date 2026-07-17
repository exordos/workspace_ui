import { expect, type Locator, type Page } from "@playwright/test";

const MESSAGE_COMPOSER = /поле ввода сообщения|message composer/i;
const READY_COMPOSER_PLACEHOLDER = /написать сообщение|write a message/i;

export function messageComposerTextarea(page: Page): Locator {
  return page.getByRole("form", { name: MESSAGE_COMPOSER }).getByRole("textbox");
}

/** Confirms that the routed chat is selected and can accept a message. */
export async function expectReadyMessageComposer(page: Page): Promise<Locator> {
  const textarea = messageComposerTextarea(page);

  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await expect(textarea).toHaveAttribute("placeholder", READY_COMPOSER_PLACEHOLDER);
  await expect(textarea).toBeEnabled();

  return textarea;
}
