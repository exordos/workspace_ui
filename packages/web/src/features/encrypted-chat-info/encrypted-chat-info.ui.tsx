import { useId, useState } from "react";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { PanelMenuRow } from "~/shared/ui/panel-menu-row.ui";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SelectableRow } from "~/shared/ui/selectable-row.ui";
import { Spinner } from "~/shared/ui/spinner.ui";
import { WorkspaceMemberCard } from "~/shared/ui/workspace-member-card.ui";
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
  readonly completed?: boolean;
}
const KeyRequestRow = ({
  request,
  actionsPending,
  onGrant,
  onReject,
  renderAvatar,
  completed = false,
}: KeyRequestRowProps) => (
  <li>
    <SelectableRow className="min-h-14 gap-3 px-4">
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
      {!completed ? (
        <>
          <Button
            appearance="ghost"
            variant="neutral"
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={t("e2ee.grantRequest", { name: request.name })}
            disabled={
              !request.canGrant || onGrant == null || request.pending === true || actionsPending
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
              !request.canReject || onReject == null || request.pending === true || actionsPending
            }
            onClick={() => onReject?.(request.requestMessageUuid)}
          >
            <Icon name="close" size={24} />
          </Button>
        </>
      ) : null}
    </SelectableRow>
    {request.error ? (
      <p role="alert" className="px-4 text-xs text-danger">
        {request.error}
      </p>
    ) : null}
  </li>
);
function KeySummary(props: EncryptedChatInfoProps) {
  const { keyInfo, onCopyKey, loading, canRotateKey, onRotateKey, actionsPending } = props;
  return (
    <section className="space-y-3 px-4" aria-label={t("e2ee.keyTitle")}>
      {keyInfo ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
            <span>{t("e2ee.keyUuid")}</span>
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
          <p className="truncate rounded-lg bg-card-bg px-2 py-1.5 text-sm leading-5">
            {keyInfo.name}
          </p>
          {keyInfo.createdLabel ? (
            <p className="text-sm leading-4 text-text-muted">{keyInfo.createdLabel}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t("e2ee.keyUnavailable")}</p>
      )}
      <Button
        fullWidth
        leadingIcon={<img src={cachedUrl} width={20} height={20} alt="" />}
        disabled={
          !canRotateKey || onRotateKey == null || loading === true || actionsPending === true
        }
        onClick={onRotateKey}
      >
        {t("e2ee.rotateKey")}
      </Button>
    </section>
  );
}
function LocalKeyRows(props: EncryptedChatInfoProps) {
  const keys = props.localKeys ?? [];
  if (props.localKeysLoading)
    return (
      <p role="status" className="px-4 text-xs text-text-muted">
        {t("e2ee.loading")}
      </p>
    );
  if (props.localKeysError)
    return (
      <div className="space-y-2 px-4">
        <p role="alert" className="text-xs text-danger">
          {props.localKeysError}
        </p>
        <Button size="sm" variant="neutral" onClick={props.onRetryLocalKeys}>
          {t("e2ee.retry")}
        </Button>
      </div>
    );
  if (keys.length === 0)
    return <p className="px-4 text-xs text-text-muted">{t("e2ee.noLocalKeys")}</p>;
  return (
    <ul>
      {keys.map((key) => (
        <li key={key.keyUuid}>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-sidebar-hover focus-visible:outline focus-visible:outline-accent"
            aria-label={t("e2ee.localKeyTitle") + ": " + key.keyUuid}
            disabled={props.onOpenLocalKey == null}
            onClick={() => props.onOpenLocalKey?.(key.keyUuid)}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs leading-4">
                <span className="truncate font-mono">
                  {key.keyUuid.slice(0, 8)}…{key.keyUuid.slice(-4)}
                </span>
                <span
                  className={key.isCurrent ? "shrink-0 text-accent" : "shrink-0 text-text-muted"}
                >
                  {t(key.isCurrent ? "e2ee.localKeyCurrent" : "e2ee.localKeyHistorical")}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-4 text-text-muted">
                {t("e2ee.localKeyAdded", { date: key.addedLabel })}
              </p>
            </div>
            <Icon name="chevron-right" size={16} className="shrink-0 text-text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}
function LocalKeys(props: EncryptedChatInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const keys = props.localKeys ?? [];
  const disabled = props.loading === true || props.actionsPending === true;
  return (
    <section className="space-y-2 border-t border-border-subtle pt-3">
      {props.currentKeyMissing && props.keyInfo ? (
        <div className="space-y-2 px-4 pb-2">
          <p className="text-xs text-text-muted">{t("e2ee.currentKeyMissing")}</p>
          <Button
            fullWidth
            appearance="outline"
            disabled={disabled || !props.canRequestKey || props.onRequestKey == null}
            onClick={() => props.keyInfo && props.onRequestKey?.(props.keyInfo.name)}
          >
            {t("e2ee.requestCurrentKey")}
          </Button>
          {props.requestedKeyUuid === props.keyInfo.name ? (
            <p role="status" className="text-xs text-text-muted">
              {t("e2ee.currentKeyRequested")}
            </p>
          ) : null}
        </div>
      ) : null}
      <PanelMenuRow
        label={t("e2ee.localKeysTitle", { count: keys.length })}
        density="compact"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
        right={
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            className="text-text-muted"
          />
        }
      />
      {expanded ? (
        <div id={listId}>
          <LocalKeyRows {...props} />
        </div>
      ) : null}
    </section>
  );
}
function LocalKeyDetails(props: EncryptedChatInfoProps) {
  const key = props.localKeys?.find((item) => item.keyUuid === props.selectedLocalKeyUuid);
  if (props.localKeysLoading)
    return (
      <p role="status" className="px-4 text-sm text-text-muted">
        {t("e2ee.loading")}
      </p>
    );
  if (props.localKeysError)
    return (
      <div className="space-y-3 px-4">
        <p role="alert" className="text-sm text-danger">
          {props.localKeysError}
        </p>
        <Button variant="neutral" onClick={props.onRetryLocalKeys}>
          {t("e2ee.retry")}
        </Button>
      </div>
    );
  if (key == null)
    return (
      <p role="status" className="px-4 text-sm text-text-muted">
        {t("e2ee.localKeyUnavailable")}
      </p>
    );
  const disabled = props.loading === true || props.actionsPending === true;
  return (
    <section className="space-y-5 px-4" aria-label={t("e2ee.localKeyTitle")}>
      <div className="space-y-2">
        <p className="text-sm text-text-muted">{t("e2ee.localKeyUuid")}</p>
        <p className="select-text break-all rounded-lg bg-card-bg px-2 py-2 font-mono text-sm">
          {key.keyUuid}
        </p>
        <p className={key.isCurrent ? "text-xs text-accent" : "text-xs text-text-muted"}>
          {t(key.isCurrent ? "e2ee.localKeyCurrent" : "e2ee.localKeyHistorical")}
        </p>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-text-muted">{t("e2ee.localKeyAnnouncedLabel")}</dt>
          <dd className="mt-1">{key.announcedLabel}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t("e2ee.localKeyAddedLabel")}</dt>
          <dd className="mt-1">{key.addedLabel}</dd>
        </div>
      </dl>
      <Button
        fullWidth
        appearance="outline"
        disabled={disabled || !props.canRequestKey || props.onRequestKey == null}
        onClick={() => props.onRequestKey?.(key.keyUuid)}
      >
        {t("e2ee.requestLocalKey")}
      </Button>
      {props.requestedKeyUuid === key.keyUuid ? (
        <p role="status" className="text-xs text-text-muted">
          {t("e2ee.localKeyRequested")}
        </p>
      ) : null}
      <Button
        fullWidth
        variant="danger"
        appearance="ghost"
        disabled={disabled || props.onDeleteLocalKey == null}
        onClick={() => props.onDeleteLocalKey?.(key.keyUuid)}
      >
        {t("e2ee.deleteLocalKey")}
      </Button>
    </section>
  );
}
function RequestList({
  requests,
  completed,
  ...props
}: EncryptedChatInfoProps & { readonly completed?: boolean }) {
  return requests.length > 0 ? (
    <ul className="space-y-3">
      {requests.map((request) => (
        <KeyRequestRow
          key={request.requestMessageUuid}
          request={request}
          renderAvatar={props.renderAvatar}
          actionsPending={props.actionsPending === true || props.loading === true}
          onGrant={props.onGrantRequest}
          onReject={props.onRejectRequest}
          completed={completed}
        />
      ))}
    </ul>
  ) : (
    <p className="px-4 text-sm text-text-muted">{t("e2ee.noRequests")}</p>
  );
}
function GrantAllButton(props: EncryptedChatInfoProps) {
  return (
    <div className="flex justify-end px-4">
      <Button
        appearance="ghost"
        variant="neutral"
        type="button"
        className="h-auto p-0 text-sm text-accent underline underline-offset-4"
        disabled={
          !props.canGrantAll ||
          props.onGrantAll == null ||
          props.loading === true ||
          props.actionsPending === true ||
          props.requests.length === 0
        }
        onClick={props.onGrantAll}
      >
        {t("e2ee.grantAll")}
      </Button>
    </div>
  );
}
function RequestSection({
  title,
  completed = false,
  ...props
}: EncryptedChatInfoProps & { readonly sectionTitle?: string; readonly completed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const label = props.sectionTitle ?? title;
  return (
    <section className="space-y-3">
      <PanelMenuRow
        label={label}
        density="compact"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        right={
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            className="text-text-muted"
          />
        }
      />
      {expanded ? (
        <>
          {!completed ? <GrantAllButton {...props} title={title} /> : null}
          <RequestList {...props} title={title} completed={completed} />
        </>
      ) : null}
    </section>
  );
}
function ChannelSettings(props: EncryptedChatInfoProps) {
  const description = props.description?.trim();
  return (
    <div className="space-y-5">
      <dl className="space-y-3 px-4">
        <div>
          <dt className="text-sm text-text-muted">{t("channel.channelName")}</dt>
          <dd className="mt-1 text-sm text-text-primary">{props.title}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">{t("channel.description")}</dt>
          <dd className="mt-1 text-sm text-text-primary">
            {description != null && description.length > 0
              ? description
              : t("channel.noDescription")}
          </dd>
        </div>
      </dl>
      <p className="px-4 text-xs text-text-muted">{t("e2ee.channelSettingsReadOnly")}</p>
      <PanelMenuRow
        label={t("e2ee.keyTitle")}
        icon="chatLock"
        iconSize={24}
        onClick={() => props.onScreenChange?.("key")}
        right={<Icon name="chevron-right" size={20} className="text-text-muted" />}
      />
      <div className="flex items-center justify-between gap-2 px-4 text-sm">
        <span>{t("channel.type")}</span>
        <span className="text-text-muted">{props.channelTypeLabel}</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 text-sm">
        <span>{t("channel.members")}</span>
        <span className="text-text-muted">{props.participantsCount}</span>
      </div>
    </div>
  );
}
function MemberList(props: EncryptedChatInfoProps) {
  return (
    <section className="border-t border-border-subtle pt-5" aria-label={t("channel.members")}>
      <h3 className="mb-3 flex h-8 items-center justify-between px-4 text-base font-medium">
        {t("channel.members")}
        <Button
          appearance="ghost"
          variant="neutral"
          type="button"
          aria-label={t("channel.addMembers")}
          className={`${ICON_BUTTON_CLASS} h-8 w-8 text-text-muted`}
          disabled={props.onAddMember == null || props.loading}
          onClick={props.onAddMember}
        >
          <Icon name="person_add" size={24} />
        </Button>
      </h3>
      {props.members.length > 0 ? (
        <ul className="space-y-1">
          {props.members.map((member) => (
            <li key={member.id}>
              <WorkspaceMemberCard
                name={member.name}
                roleLabel={member.roleLabel}
                secondaryText={member.statusLabel ?? member.email}
                avatar={
                  props.renderAvatar ? (
                    props.renderAvatar(member)
                  ) : (
                    <Avatar size="sm" src={member.avatarUrl} presence={member.presence}>
                      {member.name.slice(0, 1)}
                    </Avatar>
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 text-sm text-text-muted">{t("channel.noMembers")}</p>
      )}
    </section>
  );
}
function KeyRequestHistory(props: EncryptedChatInfoProps) {
  const grantedRequests = props.grantedRequests ?? [];
  const rejectedRequests = props.rejectedRequests ?? [];
  const hasRequestHistory =
    props.requests.length > 0 || grantedRequests.length > 0 || rejectedRequests.length > 0;
  if (!hasRequestHistory) return null;
  return (
    <>
      <p className="px-4 text-xs text-text-muted">{t("e2ee.loadedHistoryHint")}</p>
      <div className="flex flex-col">
        {props.requests.length > 0 ? (
          <RequestSection
            {...props}
            sectionTitle={t("e2ee.incomingTitle", { count: props.requests.length })}
          />
        ) : null}
        {grantedRequests.length > 0 ? (
          <RequestSection
            {...props}
            requests={grantedRequests}
            sectionTitle={t("e2ee.grantedTitle", { count: grantedRequests.length })}
            completed
          />
        ) : null}
        {rejectedRequests.length > 0 ? (
          <RequestSection
            {...props}
            requests={rejectedRequests}
            sectionTitle={t("e2ee.rejectedTitle", { count: rejectedRequests.length })}
            completed
          />
        ) : null}
      </div>
    </>
  );
}

/** Drawer shell owns all navigation chrome; this component renders only the active screen body. */
export const EncryptedChatInfo = (props: EncryptedChatInfoProps) => {
  const {
    title,
    participantsCount,
    onlineCount,
    screen = "info",
    loading,
    error,
    unavailableReason,
    showKeyManagement = true,
  } = props;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary"
      aria-busy={loading}
      data-encrypted-chat-screen={screen}
    >
      <ScrollArea className="flex flex-1 flex-col gap-5 py-4">
        {loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 text-sm text-text-muted"
          >
            <Spinner size="sm" />
            {t("e2ee.loading")}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="px-4 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {unavailableReason ? (
          <p role="status" className="px-4 text-sm text-text-muted">
            {unavailableReason}
          </p>
        ) : null}
        {screen === "settings" ? <ChannelSettings {...props} /> : null}
        {screen === "key" ? (
          <>
            <KeySummary {...props} />
            <LocalKeys {...props} />
            <KeyRequestHistory {...props} />
          </>
        ) : null}
        {screen === "local-key" ? <LocalKeyDetails {...props} /> : null}
        {screen === "info" ? (
          <>
            <div className="flex items-center gap-4 px-4">
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
            <div className="flex gap-2 px-4">
              <Button
                variant="neutral"
                aria-label={t("call.call")}
                disabled={props.onCall == null || loading}
                onClick={props.onCall}
                className="h-12 flex-1"
              >
                <Icon name="phone" size={32} />
              </Button>
              <Button
                aria-label={t("settings.settings")}
                disabled={props.onOpenSettings == null || loading}
                onClick={props.onOpenSettings}
                className="h-12 flex-1 bg-accent-soft"
              >
                <img src={settingsUrl} width={32} height={32} alt="" />
              </Button>
            </div>
            {showKeyManagement ? (
              <>
                <div className="space-y-5 border-t border-border-subtle pt-5">
                  <h3 className="px-4 text-base font-medium">{t("e2ee.keyTitle")}</h3>
                  <KeySummary {...props} />
                </div>
                {props.requests.length > 0 ? (
                  <section
                    className="space-y-3 border-t border-border-subtle pt-5"
                    aria-label={
                      props.requestsLabel ??
                      t("e2ee.requestsTitle", { count: props.requests.length })
                    }
                  >
                    <h3 className="px-4 text-base font-medium">
                      {props.requestsLabel ??
                        t("e2ee.requestsTitle", { count: props.requests.length })}
                    </h3>
                    <p className="px-4 text-xs text-text-muted">{t("e2ee.loadedHistoryHint")}</p>
                    <GrantAllButton {...props} />
                    <RequestList {...props} />
                  </section>
                ) : null}
              </>
            ) : null}
            <MemberList {...props} />
          </>
        ) : null}
      </ScrollArea>
    </div>
  );
};
