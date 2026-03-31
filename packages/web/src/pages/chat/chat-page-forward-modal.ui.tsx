import * as Dialog from "@radix-ui/react-dialog";
import React, { useEffect, useMemo, useState } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { toggleForwardRecipient } from "./chat-forward.lib";
import type { ForwardMessageModalBodyProps } from "./chat-page.types";

export const ForwardMessageModalBody = React.memo<ForwardMessageModalBodyProps>(
  function ForwardMessageModalBody({ streams, onForward, onClose }) {
    const [tab, setTab] = useState<"channel" | "dm">("channel");
    const [selectedStream, setSelectedStream] = useState<string>("");
    const [topic, setTopic] = useState("general");
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [dmSearch, setDmSearch] = useState("");
    const stream = streams.find((s) => s.name === selectedStream);
    const topics = stream?.topics?.map((tp) => tp.subject) ?? [];
    const allUsers = useUsersStore((s) => s.users);
    const userList = useMemo(() => {
      const list = Array.from(allUsers.values());
      if (!dmSearch.trim()) return list;
      const q = dmSearch.trim().toLowerCase();
      return list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) || (u.email?.toLowerCase().includes(q) ?? false),
      );
    }, [allUsers, dmSearch]);

    useEffect(() => {
      if (tab !== "dm") {
        return;
      }
      for (const user of userList) {
        void ensureUserStatusLoaded(user.user_id);
      }
    }, [tab, userList]);

    return (
      <>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <Dialog.Title className="text-sm font-semibold text-text-primary">
            {tab === "channel" ? t("message.forwardToChannel") : t("message.forwardToDm")}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              type="button"
              onClick={onClose}
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
                  setTopic("general");
                }}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none"
              >
                <option value="">{t("channel.selectChannel")}</option>
                {streams.map((s) => (
                  <option key={s.stream_id} value={s.name}>
                    #{s.name}
                  </option>
                ))}
              </select>
              <label className="text-sm text-text-muted">{t("channel.topicName")}</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                list="forward-topics"
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder={t("channel.newTopic")}
              />
              {topics.length > 0 && (
                <datalist id="forward-topics">
                  {topics.map((subj) => (
                    <option key={subj} value={subj} />
                  ))}
                </datalist>
              )}
            </>
          ) : (
            <>
              <input
                type="text"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder={t("message.searchUsers")}
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border-subtle">
                {userList.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-text-muted">
                    {t("search.noResults")}
                  </p>
                ) : (
                  userList.map((u) => {
                    const statusLabel = formatUserStatusLabel(u.status);
                    return (
                      <button
                        type="button"
                        key={u.user_id}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          selectedUserIds.includes(u.user_id)
                            ? "bg-accent/20 text-text-primary"
                            : "text-text-primary hover:bg-bg-elevated"
                        }`}
                        onClick={() =>
                          setSelectedUserIds((prev) => toggleForwardRecipient(prev, u.user_id))
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{u.full_name}</span>
                          {(statusLabel != null && statusLabel.length > 0) || u.email ? (
                            <span className="block truncate text-[11px] text-text-secondary">
                              {statusLabel ?? u.email ?? ""}
                            </span>
                          ) : null}
                        </span>
                        {selectedUserIds.includes(u.user_id) ? (
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
                className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
              >
                {t("common.cancel")}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={tab === "channel" ? !selectedStream : selectedUserIds.length === 0}
              onClick={() => {
                if (tab === "dm" && selectedUserIds.length > 0) {
                  onForward("", "", selectedUserIds);
                } else {
                  onForward(selectedStream, topic || "general");
                }
              }}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
            >
              {t("message.forwardTo")}
            </button>
          </div>
        </div>
      </>
    );
  },
);
