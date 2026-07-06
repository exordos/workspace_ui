import * as Dialog from "@radix-ui/react-dialog";
import React, { useMemo, useState } from "react";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import type { ForwardMessageModalBodyProps } from "./chat-page.types";

function isForwardRecipientUser(user: User | undefined): user is User {
  return user != null;
}

export const ForwardMessageModalBody = React.memo<ForwardMessageModalBodyProps>(
  function ForwardMessageModalBody({
    streamOptions,
    topicOptions,
    currentUserUuid,
    isForwarding = false,
    onForward,
    onClose,
  }) {
    const [tab, setTab] = useState<"channel" | "dm">("channel");
    const [selectedStream, setSelectedStream] = useState<string>("");
    const [selectedTopic, setSelectedTopic] = useState<string>("");
    const [selectedUserUuid, setSelectedUserUuid] = useState<string>("");
    const [dmSearch, setDmSearch] = useState("");
    const usersById = useUsersStore((state) => state.usersById);
    const userIds = useUsersStore((state) => state.userIds);
    const topics = useMemo(
      () => topicOptions.filter((topicOption) => topicOption.streamUuid === selectedStream),
      [selectedStream, topicOptions],
    );
    const userList = useMemo(() => {
      const normalizedSearch = dmSearch.trim().toLowerCase();
      return userIds
        .map((userUuid) => usersById[userUuid])
        .filter(isForwardRecipientUser)
        .filter((user) => user.uuid !== currentUserUuid)
        .map((user) => {
          const displayName = selectUserDisplayName(user, user.uuid);
          return {
            userUuid: user.uuid,
            displayName,
            username: user.username,
            email: user.email ?? "",
          };
        })
        .filter((user) => {
          if (normalizedSearch.length === 0) {
            return true;
          }
          return [user.displayName, user.username, user.email].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          );
        });
    }, [currentUserUuid, dmSearch, userIds, usersById]);

    return (
      <>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <Dialog.Title className="text-sm font-semibold text-text-primary">
            {tab === "channel" ? t("message.forwardToChannel") : t("message.forwardToDm")}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {tab === "channel" ? t("message.forwardToChannel") : t("message.forwardToDm")}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              onClick={onClose}
              disabled={isForwarding}
              className="hover:bg-bg/50 rounded p-1 text-text-muted"
              aria-label={t("common.close")}
            >
              <Icon name="close" size={18} />
            </button>
          </Dialog.Close>
        </div>
        <div className="flex border-b border-border-subtle">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === "channel"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            disabled={isForwarding}
            onClick={() => setTab("channel")}
          >
            {t("message.channel")}
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              tab === "dm"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            disabled={isForwarding}
            onClick={() => setTab("dm")}
          >
            {t("message.directMessage")}
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-hidden p-4">
          {tab === "channel" ? (
            <>
              <label className="text-sm text-text-muted">{t("channel.name")}</label>
              <select
                value={selectedStream}
                onChange={(e) => {
                  setSelectedStream(e.target.value);
                  setSelectedTopic("");
                }}
                aria-label={t("channel.name")}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none"
                disabled={isForwarding}
              >
                <option value="">{t("channel.selectChannel")}</option>
                {streamOptions.map((streamOption) => (
                  <option key={streamOption.streamUuid} value={streamOption.streamUuid}>
                    #{streamOption.name}
                  </option>
                ))}
              </select>
              <label className="text-sm text-text-muted">{t("channel.topicName")}</label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                aria-label={t("channel.topicName")}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                disabled={selectedStream.length === 0 || isForwarding}
              >
                <option value="">{t("chat.selectTopic")}</option>
                {topics.map((topicOption) => {
                  const topicDisplay = resolveTopicDisplayInfo(topicOption.name);
                  return (
                    <option key={topicOption.topicUuid} value={topicOption.topicUuid}>
                      {topicDisplay.label}
                    </option>
                  );
                })}
              </select>
            </>
          ) : (
            <>
              <input
                type="text"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder={t("message.searchUsers")}
                disabled={isForwarding}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border-subtle">
                {userList.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-text-muted">
                    {t("search.noResults")}
                  </p>
                ) : (
                  userList.map((u) => {
                    return (
                      <button
                        type="button"
                        key={u.userUuid}
                        aria-label={u.displayName}
                        disabled={isForwarding}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          selectedUserUuid === u.userUuid
                            ? "bg-accent/20 text-text-primary"
                            : "text-text-primary hover:bg-bg-elevated"
                        }`}
                        onClick={() => setSelectedUserUuid(u.userUuid)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{u.displayName}</span>
                          {u.email ? (
                            <span className="block truncate text-[11px] text-text-secondary">
                              {u.email}
                            </span>
                          ) : null}
                        </span>
                        {selectedUserUuid === u.userUuid ? (
                          <Icon name="check" size={14} className="ml-auto text-accent" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                disabled={isForwarding}
                className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
              >
                {t("common.cancel")}
              </button>
            </Dialog.Close>
            <DialogPrimaryButton
              disabled={
                tab === "channel"
                  ? selectedStream.length === 0 || selectedTopic.length === 0
                  : selectedUserUuid.length === 0
              }
              isSubmitting={isForwarding}
              onClick={() => {
                if (isForwarding) return;
                if (tab === "dm" && selectedUserUuid.length > 0) {
                  onForward({ kind: "direct", userUuid: selectedUserUuid });
                } else {
                  onForward({
                    kind: "topic",
                    streamUuid: selectedStream,
                    topicUuid: selectedTopic,
                  });
                }
              }}
              className="px-3 py-1.5"
            >
              {t("message.forwardTo")}
            </DialogPrimaryButton>
          </div>
        </div>
      </>
    );
  },
);
