import type { MessengerE2eePayload } from "~/entities/messenger/messenger.types";
import { t } from "~/i18n/i18n";

/** Summaries describe the message kind without reading encoded content. */
export function encryptedMessageLabel(payload: MessengerE2eePayload): string {
  const labels = {
    e2ee: "e2ee.lockedTitle",
    key_request: "e2ee.keyRequestTitle",
    key_grant: "e2ee.keyGrantTitle",
    key_announced: "e2ee.keyAnnouncedTitle",
    key_reject: "e2ee.keyRejectTitle",
  };
  return t(labels[payload.kind]);
}
