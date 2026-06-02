import { t } from "~/i18n/i18n";

export function resolveJitsiCallHeaderTitle(
  callName: string,
  participantCount: number | null,
): string {
  if (callName.length > 0) {
    return `${t("call.call")} - ${callName}`;
  }
  if (participantCount !== null) {
    return t("call.callWithParticipants", { count: participantCount });
  }
  return t("call.call");
}

export function resolveJitsiCallHeaderSubtitle(
  participantCount: number | null,
): string | undefined {
  if (participantCount === null) {
    return undefined;
  }
  return t("call.participants", { count: participantCount });
}
