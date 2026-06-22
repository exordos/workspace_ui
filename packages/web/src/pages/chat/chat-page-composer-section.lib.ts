import { t } from "~/i18n/i18n";

export function resolveComposerPlaceholder(options: {
  dmPartnerDeactivated: boolean;
  isDmView: boolean;
  activeStreamUuid: string | null | undefined;
  activeStream: string | null | undefined;
}): string {
  if (options.dmPartnerDeactivated) {
    return t("dm.composerBlockedPlaceholder");
  }
  if (options.isDmView) {
    return options.activeStreamUuid != null ? t("chat.sendPlaceholder") : t("chat.selectChat");
  }
  return options.activeStream ? t("chat.sendPlaceholder") : t("chat.selectChannel");
}

export function isComposerDisabled(options: {
  dmPartnerDeactivated: boolean;
  isDmView: boolean;
  activeStreamUuid: string | null | undefined;
  activeStream: string | null | undefined;
}): boolean {
  if (options.dmPartnerDeactivated) {
    return true;
  }
  return options.isDmView ? options.activeStreamUuid == null : !options.activeStream;
}

export function shouldShowTopicPrompt(options: {
  isDmView: boolean;
  isPrivateStreamView: boolean;
  activeTopic: string | null | undefined;
}): boolean {
  return !options.isDmView && !options.isPrivateStreamView && options.activeTopic == null;
}
