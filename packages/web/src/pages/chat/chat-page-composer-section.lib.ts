import { t } from "~/i18n/i18n";

export function resolveComposerPlaceholder(options: {
  dmPartnerDeactivated: boolean;
  isDmView: boolean;
  activeDmUserIds: number[] | null | undefined;
  activeStream: string | null | undefined;
}): string {
  if (options.dmPartnerDeactivated) {
    return t("dm.composerBlockedPlaceholder");
  }
  if (options.isDmView) {
    return options.activeDmUserIds?.length ? t("chat.sendPlaceholder") : t("chat.selectChat");
  }
  return options.activeStream ? t("chat.sendPlaceholder") : t("chat.selectChannel");
}

export function isComposerDisabled(options: {
  dmPartnerDeactivated: boolean;
  isDmView: boolean;
  activeDmUserIds: number[] | null | undefined;
  activeStream: string | null | undefined;
}): boolean {
  if (options.dmPartnerDeactivated) {
    return true;
  }
  return options.isDmView ? !options.activeDmUserIds?.length : !options.activeStream;
}
