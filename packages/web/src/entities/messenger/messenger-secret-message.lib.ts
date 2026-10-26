import { t } from "~/i18n/i18n";
import { isWorkspaceMessageWithinLimit } from "~/shared/lib/workspace-message-limits.lib";
import { buildWorkspaceSecretUrn } from "~/shared/lib/workspace-reference-urn.lib";
import {
  parseWorkspaceSecretDraft,
  replaceWorkspaceSecretDraft,
} from "~/shared/lib/workspace-secret-draft.lib";
import type { ChatEncryptedPayload } from "./chat-e2ee.types";

export function buildMessengerSecretMarkdown(
  streamUuid: string,
  markdown: string,
  payloads: readonly ChatEncryptedPayload[],
): string {
  const result = replaceWorkspaceSecretDraft(
    markdown,
    parseWorkspaceSecretDraft(markdown),
    payloads.map((payload) => {
      const urn = buildWorkspaceSecretUrn(streamUuid, payload.keyUuid, payload.content);
      if (urn == null) throw new Error(t("composer.invalidSecret"));
      return `[${t("e2ee.secretFragment")}](${urn})`;
    }),
  );
  if (!isWorkspaceMessageWithinLimit(result)) throw new Error(t("composer.messageTooLong"));
  return result;
}
