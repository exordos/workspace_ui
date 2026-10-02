import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SelectableRow } from "~/shared/ui/selectable-row.ui";
import { Spinner } from "~/shared/ui/spinner.ui";
import cachedUrl from "./assets/cached.svg";
import settingsUrl from "./assets/instant-mix.svg";
import type {
  EncryptedChatInfoProps,
  EncryptedChatKeyRequestView,
} from "./encrypted-chat-info.types";

const ICON_BUTTON_CLASS = "h-6 w-6 shrink-0 rounded p-0 text-accent";

export const EncryptedChatAvatar = () => (
  <Avatar size="xl" className="border-0 bg-accent">
    <Icon name="chatLock" size={40} className="text-on-accent" />
  </Avatar>
);

interface KeyRequestRowProps {
  readonly request: EncryptedChatKeyRequestView;
  readonly actionsPending: boolean;
  readonly renderAvatar?: EncryptedChatInfoProps["renderAvatar"];
  readonly onGrant?: EncryptedChatInfoProps["onGrantRequest"];
  readonly onReject?: EncryptedChatInfoProps["onRejectRequest"];
}

const KeyRequestRow = ({
  request,
  actionsPending,
  onGrant,
  onReject,
  renderAvatar,
}: KeyRequestRowProps) => (
  <li>
    <SelectableRow className="min-h-14 gap-3">
      {renderAvatar ? (
        renderAvatar(request)
      ) : (
        <Avatar size="sm" src={request.avatarUrl}>
          {request.name.slice(0, 1)}
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm leading-5 text-text-primary">
          <Icon name="businessCenter" size={16} className="text-text-muted" />
          <span className="truncate">{request.name}</span>
        </p>
        <p className="truncate text-xs leading-5 text-text-secondary">{request.deviceName}</p>
      </div>
      <Button
        appearance="ghost"
        variant="neutral"
        type="button"
        className={ICON_BUTTON_CLASS}
        aria-label={t("e2ee.grantRequest", { name: request.name })}
        disabled={
          !request.canGrant || onGrant == null || (request.pending ?? false) || actionsPending
        }
        aria-busy={request.pending}
        onClick={() => onGrant?.(request.requestMessageUuid)}
      >
        {request.pending ? <Spinner size="sm" /> : <Icon name="check" size={24} />}
      </Button>
      <Button
        appearance="ghost"
        variant="neutral"
        type="button"
        className={ICON_BUTTON_CLASS}
        aria-label={t("e2ee.rejectRequest", { name: request.name })}
        disabled={
          !request.canReject || onReject == null || (request.pending ?? false) || actionsPending
        }
        onClick={() => onReject?.(request.requestMessageUuid)}
      >
        <Icon name="close" size={24} />
      </Button>
    </SelectableRow>
    {request.error ? (
      <p role="alert" className="px-3 text-xs text-danger">
        {request.error}
      </p>
    ) : null}
  </li>
);

/** The controller owns permissions, clipboard access, key lifecycle, and requests. */
export const EncryptedChatInfo = ({
  title,
  participantsCount,
  onlineCount,
  keyInfo,
  requests,
  members,
  requestsLabel,
  renderAvatar,
  unavailableReason,
  loading = false,
  error,
  actionsPending = false,
  showKeyManagement = true,
  showHeader = true,
  canRotateKey = false,
  canGrantAll = false,
  onClose,
  onCopyKey,
  onRotateKey,
  onGrantAll,
  onGrantRequest,
  onRejectRequest,
  onOpenSettings,
  onCall,
  onAddMember,
}: EncryptedChatInfoProps) => (
  <aside
    aria-label={t("chatInfo.channelInfo")}
    aria-busy={loading}
    className="flex h-full min-h-0 w-[299px] max-w-full shrink-0 flex-col rounded-md bg-card-bg px-2 py-5 text-text-primary"
  >
    <ScrollArea className="flex flex-col gap-5">
      <header className="flex flex-col gap-5 px-2">
        {showHeader ? (
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium leading-5">{t("chatInfo.channelInfo")}</h2>
            <Button
              appearance="ghost"
              variant="neutral"
              type="button"
              aria-label={t("common.close")}
              onClick={onClose}
              disabled={onClose == null}
              className={`${ICON_BUTTON_CLASS} text-text-muted`}
            >
              <Icon name="close" size={24} />
            </Button>
          </div>
        ) : null}
        <div className="flex items-center gap-4">
          <EncryptedChatAvatar />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="truncate text-xl font-medium leading-5">{title}</p>
            <p className="text-base leading-4 text-accent">{t("e2ee.protectedChat")}</p>
            <p className="text-sm leading-4 text-text-muted">
              {t("channel.participants", { count: participantsCount })},{" "}
              {t("channel.online", { count: onlineCount })}
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-2">
        <Button
          variant="neutral"
          aria-label={t("call.call")}
          disabled={onCall == null || loading}
          onClick={onCall}
          className="h-12 flex-1"
        >
          <Icon name="phone" size={32} />
        </Button>
        <Button
          aria-label={t("settings.settings")}
          disabled={onOpenSettings == null || loading}
          onClick={onOpenSettings}
          className="h-12 flex-1 bg-accent-soft"
        >
          <img src={settingsUrl} width={32} height={32} alt="" />
        </Button>
      </div>

      {loading ? (
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <Spinner size="sm" />
          {t("e2ee.loading")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {unavailableReason ? (
        <p role="status" className="px-2 text-sm text-text-muted">
          {unavailableReason}
        </p>
      ) : null}
      {showKeyManagement ? (
        <>
          <section
            className="flex flex-col gap-3 border-t border-border-subtle pt-5"
            aria-label={t("e2ee.keyTitle")}
          >
            <div className="flex flex-col gap-5 px-2">
              <h3 className="text-base font-medium leading-5">{t("e2ee.keyTitle")}</h3>
              {keyInfo ? (
                <div className="flex flex-col gap-2">
                  <div className="flex h-6 items-center justify-between text-sm text-text-muted">
                    {t("e2ee.currentKey")}
                    <Button
                      appearance="ghost"
                      variant="neutral"
                      type="button"
                      aria-label={t("e2ee.copyKey")}
                      className={`${ICON_BUTTON_CLASS} text-text-muted`}
                      disabled={onCopyKey == null || loading}
                      onClick={onCopyKey}
                    >
                      <Icon name="copy" size={24} />
                    </Button>
                  </div>
                  <p className="truncate rounded-lg bg-bg-elevated px-2 py-1.5 text-sm leading-5">
                    {keyInfo.name}
                  </p>
                  {keyInfo.createdLabel ? (
                    <p className="text-sm leading-4 text-text-muted">{keyInfo.createdLabel}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-text-muted">{t("e2ee.keyUnavailable")}</p>
              )}
            </div>
            <Button
              fullWidth
              leadingIcon={<img src={cachedUrl} width={20} height={20} alt="" />}
              disabled={!canRotateKey || onRotateKey == null || loading || actionsPending}
              onClick={onRotateKey}
            >
              {t("e2ee.rotateKey")}
            </Button>
          </section>

          <section
            className="flex flex-col gap-3 border-t border-border-subtle pt-5"
            aria-label={requestsLabel ?? t("e2ee.requestsTitle", { count: requests.length })}
          >
            <h3 className="px-2 text-base font-medium leading-5">
              {requestsLabel ?? t("e2ee.requestsTitle", { count: requests.length })}
            </h3>
            <div className="flex justify-end px-2">
              <Button
                appearance="ghost"
                variant="neutral"
                type="button"
                className="h-auto p-0 text-base leading-4 text-accent underline underline-offset-4"
                disabled={
                  !canGrantAll ||
                  onGrantAll == null ||
                  loading ||
                  actionsPending ||
                  requests.length === 0
                }
                onClick={onGrantAll}
              >
                {t("e2ee.grantAll")}
              </Button>
            </div>
            {requests.length > 0 ? (
              <ul className="space-y-3">
                {requests.map((request) => (
                  <KeyRequestRow
                    key={request.requestMessageUuid}
                    request={request}
                    renderAvatar={renderAvatar}
                    actionsPending={actionsPending || loading}
                    onGrant={onGrantRequest}
                    onReject={onRejectRequest}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 text-sm text-text-muted">{t("e2ee.noRequests")}</p>
            )}
          </section>
        </>
      ) : null}

      <section className="border-t border-border-subtle pt-5" aria-label={t("channel.members")}>
        <h3 className="mb-3 flex h-8 items-center justify-between px-2 text-base font-medium">
          {t("channel.members")}
          <Button
            appearance="ghost"
            variant="neutral"
            type="button"
            aria-label={t("channel.addMembers")}
            className={`${ICON_BUTTON_CLASS} h-8 w-8 text-text-muted`}
            disabled={onAddMember == null || loading}
            onClick={onAddMember}
          >
            <Icon name="person_add" size={24} />
          </Button>
        </h3>
        {members.length > 0 ? (
          <ul className="space-y-1">
            {members.map((member) => (
              <li key={member.id}>
                <SelectableRow className="min-h-14 gap-3">
                  {renderAvatar ? (
                    renderAvatar(member)
                  ) : (
                    <Avatar size="sm" src={member.avatarUrl}>
                      {member.name.slice(0, 1)}
                    </Avatar>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm leading-5">
                      <Icon name="businessCenter" size={16} className="text-text-muted" />
                      <span className="truncate">{member.name}</span>
                    </p>
                    {member.statusLabel ? (
                      <p className="truncate text-xs leading-5 text-text-secondary">
                        {member.statusLabel}
                      </p>
                    ) : null}
                  </div>
                  {member.roleLabel ? (
                    <span className="text-xs text-text-secondary">{member.roleLabel}</span>
                  ) : null}
                </SelectableRow>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-sm text-text-muted">{t("channel.noMembers")}</p>
        )}
      </section>
    </ScrollArea>
  </aside>
);
