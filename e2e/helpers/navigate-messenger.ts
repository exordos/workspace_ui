import type { Page } from "@playwright/test";
import {
  E2E_ORGANIZATION_ID,
  E2E_PROJECT_ID,
  E2E_STREAM_UUID as E2E_DEFAULT_STREAM_UUID,
  E2E_TOPIC_UUID as E2E_DEFAULT_TOPIC_UUID,
} from "../mocks/workspace-default-responses";

export function e2eOrgBasePath(): string {
  return `/org/${E2E_ORGANIZATION_ID}/project/${E2E_PROJECT_ID}`;
}

export const E2E_STREAM_UUID = E2E_DEFAULT_STREAM_UUID;
export const E2E_TOPIC_UUID = E2E_DEFAULT_TOPIC_UUID;

/** Opens a stream topic view where the message composer is rendered. */
export async function openStreamChatWithComposer(
  page: Page,
  streamUuid = E2E_STREAM_UUID,
  topicUuid = E2E_TOPIC_UUID,
): Promise<void> {
  await page.goto(`${e2eOrgBasePath()}/stream/${streamUuid}/topic/${topicUuid}`);
  await page
    .getByPlaceholder(/сообщение|message/i)
    .or(page.locator("textarea"))
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}
