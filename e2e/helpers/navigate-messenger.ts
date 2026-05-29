import type { Page } from "@playwright/test";
import { E2E_REALM } from "../mocks/zulip-default-responses";

export function e2eOrgBasePath(): string {
  const hostname = new URL(E2E_REALM).hostname;
  return `/org/${hostname}`;
}

/** Stream slug with numeric id prefix (matches E2E mock `stream_id: 10`, name `general`). */
export const E2E_STREAM_SLUG = "10-general";

/** Opens a stream topic view where the message composer is rendered. */
export async function openStreamChatWithComposer(
  page: Page,
  streamSlug = E2E_STREAM_SLUG,
  topicName = "general",
): Promise<void> {
  const topicSegment = encodeURIComponent(topicName);
  await page.goto(`${e2eOrgBasePath()}/stream/${streamSlug}/topic/${topicSegment}`);
  await page
    .getByPlaceholder(/сообщение|message/i)
    .or(page.locator("textarea"))
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}
