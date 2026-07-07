import React from "react";
import { sanitizeHtml } from "~/shared/lib/html";
import { MESSAGE_BUBBLE_BODY_CLASS_NAME } from "~/shared/lib/message-body-rich-text-classes";
import type { WorkspaceMessageBodyProps } from "./workspace-message-body.types";

const BASE_BODY_CLASS_NAME = [
  MESSAGE_BUBBLE_BODY_CLASS_NAME,
  "workspace-message-body",
  "[&_.workspace-message-file-placeholder]:inline-flex",
  "[&_.workspace-message-file-placeholder]:max-w-full",
  "[&_.workspace-message-file-placeholder]:cursor-pointer",
  "[&_.workspace-message-file-placeholder]:items-center",
  "[&_.workspace-message-file-placeholder]:rounded-md",
  "[&_.workspace-message-file-placeholder]:border",
  "[&_.workspace-message-file-placeholder]:border-border-subtle",
  "[&_.workspace-message-file-placeholder]:bg-bg/40",
  "[&_.workspace-message-file-placeholder]:px-2.5",
  "[&_.workspace-message-file-placeholder]:py-1.5",
  "[&_.workspace-message-file-placeholder]:text-left",
  "[&_.workspace-message-file-placeholder]:font-medium",
  "[&_.workspace-message-file-placeholder]:text-text-primary",
  "[&_.workspace-message-file-placeholder]:no-underline",
  "[&_.workspace-message-file-placeholder]:transition-colors",
  "[&_.workspace-message-file-placeholder]:hover:bg-bg/60",
  "[&_.workspace-message-file-placeholder]:hover:text-text-primary",
  "[&_.workspace-message-file-placeholder]:focus-visible:outline-none",
  "[&_.workspace-message-file-placeholder]:focus-visible:ring-2",
  "[&_.workspace-message-file-placeholder]:focus-visible:ring-accent-soft",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:my-1",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:h-40",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:w-60",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:max-w-full",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:justify-center",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:overflow-hidden",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']]:p-0",
  "[&_.workspace-message-file-preview-loaded[data-workspace-media-kind='image']]:!h-auto",
  "[&_.workspace-message-file-preview-loaded[data-workspace-media-kind='image']]:!w-auto",
  "[&_.workspace-message-file-preview-loaded[data-workspace-media-kind='image']]:!max-h-[180px]",
  "[&_.workspace-message-file-preview-loaded[data-workspace-media-kind='image']]:!overflow-visible",
  "[&_.workspace-message-file-preview-loaded[data-workspace-media-kind='image']]:items-center",
  "[&_.workspace-message-file-preview-loaded]:border-transparent",
  "[&_.workspace-message-file-preview-loaded]:bg-transparent",
  "[&_.workspace-message-file-preview-loaded]:p-0",
  "[&_.workspace-message-file-preview-image]:!block",
  "[&_.workspace-message-file-preview-image]:!h-auto",
  "[&_.workspace-message-file-preview-image]:!max-h-[180px]",
  "[&_.workspace-message-file-preview-image]:!w-auto",
  "[&_.workspace-message-file-preview-image]:!max-w-full",
  "[&_.workspace-message-file-preview-image]:!object-contain",
  "[&_.workspace-message-file-placeholder__label]:min-w-0",
  "[&_.workspace-message-file-placeholder__label]:truncate",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']_.workspace-message-file-placeholder__label]:px-2.5",
  "[&_.workspace-message-file-placeholder[data-workspace-media-kind='image']_.workspace-message-file-placeholder__label]:py-1.5",
  "[&_.workspace-message-mention]:inline",
  "[&_.workspace-message-mention]:cursor-pointer",
  "[&_.workspace-message-mention]:border-0",
  "[&_.workspace-message-mention]:bg-transparent",
  "[&_.workspace-message-mention]:p-0",
  "[&_.workspace-message-mention]:font-medium",
  "[&_.workspace-message-mention]:text-accent",
  "hover:[&_.workspace-message-mention]:opacity-90",
  "[&_.workspace-message-mention]:focus-visible:outline-none",
  "[&_.workspace-message-mention]:focus-visible:ring-2",
  "[&_.workspace-message-mention]:focus-visible:ring-accent-soft",
].join(" ");

function areWorkspaceMessageBodyPropsEqual(
  prev: WorkspaceMessageBodyProps,
  next: WorkspaceMessageBodyProps,
): boolean {
  return (
    prev.html === next.html &&
    prev.useInlineMeta === next.useInlineMeta &&
    prev.bodyRef === next.bodyRef &&
    prev.onBodyClick === next.onBodyClick &&
    prev.metadata.contentKind === next.metadata.contentKind &&
    prev.metadata.hasRichBlocks === next.metadata.hasRichBlocks &&
    prev.metadata.hasMentions === next.metadata.hasMentions &&
    prev.metadata.hasLinks === next.metadata.hasLinks &&
    prev.metadata.hasCodeBlocks === next.metadata.hasCodeBlocks &&
    prev.metadata.hasMedia === next.metadata.hasMedia &&
    prev.metadata.hasProtectedMedia === next.metadata.hasProtectedMedia &&
    prev.metadata.hasAttachments === next.metadata.hasAttachments &&
    prev.metadata.preferredMetaPlacement === next.metadata.preferredMetaPlacement &&
    prev.metadata.textPreview === next.metadata.textPreview
  );
}

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
  areWorkspaceMessageBodyPropsEqual,
);
