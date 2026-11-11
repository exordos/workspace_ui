import React, { useId } from "react";
import { useTranslation } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { Select } from "~/shared/ui/select";
import type { PollVoterList, WorkspaceMessagePollProps } from "./workspace-message-poll.types";

interface Props {
  multipleQuestions: boolean;
  voterList: PollVoterList;
  renderVoterAvatar: WorkspaceMessagePollProps["renderVoterAvatar"];
}

export function PollVotersDialog({
  multipleQuestions,
  voterList: { questions, target, page, onSelect, onLoadPage },
  renderVoterAvatar,
}: Readonly<Props>): React.ReactElement {
  const { t } = useTranslation();
  const selectId = useId();
  const question = questions.find((question) => question.id === target?.questionId);
  const option = question?.options.find((option) => option.id === target?.optionId);
  const options =
    target?.mode === "overview"
      ? questions.flatMap((question) =>
          question.options.map((option) => ({
            value: JSON.stringify([question.id, option.id]),
            label: option.text,
            group: { id: question.id, label: question.text },
            questionId: question.id,
            optionId: option.id,
          })),
        )
      : [];
  let status: React.ReactNode = null;
  if (page?.loading) status = <p role="status">{t("pollBubble.loading")}</p>;
  else if (page?.error)
    status = (
      <p role="alert" className="text-danger">
        {page.error}
      </p>
    );
  else if (page?.items.length === 0)
    status = <p className="text-text-secondary">{t("pollBubble.noVoters")}</p>;
  return (
    <AppDialog
      open={option != null}
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
      title={t("pollBubble.voters")}
      scrollBody
      positionClassName="top-1/2 -translate-y-1/2"
    >
      <div className="space-y-3">
        {multipleQuestions && (
          <p className="break-words text-sm text-text-secondary">{question?.text}</p>
        )}
        {target?.mode === "overview" ? (
          <Select
            id={selectId}
            size="compact"
            aria-label={t("pollBubble.answer")}
            value={JSON.stringify([target.questionId, target.optionId])}
            options={options}
            onValueChange={(value) => {
              const next = options.find((option) => option.value === value);
              if (next)
                onSelect({
                  questionId: next.questionId,
                  optionId: next.optionId,
                  mode: "overview",
                });
            }}
          />
        ) : (
          <p className="break-words text-sm">{option?.text}</p>
        )}
        {option && (
          <p className="text-xs text-text-secondary">
            {t("pollBubble.participantCount", { count: option.votes })}
          </p>
        )}
        {page?.items.map((voter) => (
          <div key={voter.id} className="flex items-center gap-3">
            {renderVoterAvatar?.(voter) ?? (
              <Avatar size="sm" src={voter.avatarUrl}>
                {voter.name.slice(0, 1)}
              </Avatar>
            )}
            <span className="break-words text-sm">{voter.name}</span>
          </div>
        ))}
        {status}
        {page && onLoadPage && (page.hasMore === true || Boolean(page.error)) && (
          <Button disabled={page.loading} appearance="ghost" onClick={onLoadPage}>
            {t(page.error ? "pollBubble.retry" : "pollBubble.loadMore")}
          </Button>
        )}
      </div>
    </AppDialog>
  );
}
