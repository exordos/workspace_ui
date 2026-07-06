import React from "react";
import { sanitizeHtml } from "~/shared/lib/html";
import { MESSAGE_BUBBLE_BODY_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import type { WorkspaceMessageBodyProps } from "./workspace-message-body.types";

const BASE_BODY_CLASS_NAME = `${MESSAGE_BUBBLE_BODY_CLASS_NAME} workspace-message-body [&_.workspace-message-file-placeholder]:inline-flex [&_.workspace-message-file-placeholder]:cursor-pointer [&_.workspace-message-file-placeholder]:items-center [&_.workspace-message-file-placeholder]:rounded-md [&_.workspace-message-file-placeholder]:border [&_.workspace-message-file-placeholder]:border-border-subtle [&_.workspace-message-file-placeholder]:bg-bg-base/70 [&_.workspace-message-file-placeholder]:px-2 [&_.workspace-message-file-placeholder]:py-0.5 [&_.workspace-message-file-placeholder]:text-left [&_.workspace-message-file-placeholder]:font-medium [&_.workspace-message-file-placeholder]:text-text-primary [&_.workspace-message-file-placeholder]:hover:border-accent-soft [&_.workspace-message-file-placeholder]:focus-visible:outline-none [&_.workspace-message-file-placeholder]:focus-visible:ring-2 [&_.workspace-message-file-placeholder]:focus-visible:ring-accent-soft [&_.workspace-message-mention]:inline [&_.workspace-message-mention]:cursor-pointer [&_.workspace-message-mention]:border-0 [&_.workspace-message-mention]:bg-transparent [&_.workspace-message-mention]:p-0 [&_.workspace-message-mention]:font-medium [&_.workspace-message-mention]:text-accent hover:[&_.workspace-message-mention]:opacity-90 [&_.workspace-message-mention]:focus-visible:outline-none [&_.workspace-message-mention]:focus-visible:ring-2 [&_.workspace-message-mention]:focus-visible:ring-accent-soft`;

export const WorkspaceMessageBody: React.FC<WorkspaceMessageBodyProps> = React.memo(
  function WorkspaceMessageBody({
    html,
    metadata,
    useInlineMeta,
    bodyRef,
    onBodyClick,
  }): React.ReactElement {
    const className = `${BASE_BODY_CLASS_NAME} ${
      useInlineMeta ? "workspace-message-bubble-inline-text" : ""
    }`;
    const safeHtml = React.useMemo(() => sanitizeHtml(html), [html]);

    return (
      <div
        ref={bodyRef}
        className={className}
        data-message-body="true"
        data-message-content-kind={metadata.contentKind}
        data-message-meta-preferred-placement={metadata.preferredMetaPlacement}
        onClick={onBodyClick}
        // HTML приходит только из Workspace render core, где markdown уже
        // разобран в документ и пропущен через sanitize boundary. Виджет не
        // добавляет запасной старый renderer, чтобы не смешивать Workspace и
        // Zulip-контракты тела сообщения.
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  },
);
