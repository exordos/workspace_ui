import { useMemo } from "react";
import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import { t } from "~/i18n/i18n";
import type {
  WorkspaceMessageBodyMetadata,
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolver,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";

const COMPOSER_PREVIEW_RENDER_OPTIONS = {
  ...DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
  enableMentions: true,
  enableProtectedMedia: true,
  enableAttachments: true,
  enableGallery: false,
} as const;

const EMPTY_FILE_REFERENCES: readonly WorkspaceMessageFileReference[] = [];

export interface MessageComposerPreviewResult {
  html: string;
  metadata: WorkspaceMessageBodyMetadata | null;
  fileReferences: readonly WorkspaceMessageFileReference[];
  loading: boolean;
  error: string | null;
}

export function useMessageComposerPreview(options: {
  mode: "write" | "preview";
  outgoingBody: string;
  enabled?: boolean;
  unsupportedText?: string;
  resolveMention?: WorkspaceMessageMentionResolver;
}): MessageComposerPreviewResult {
  const { mode, outgoingBody, enabled = true, unsupportedText, resolveMention } = options;

  return useMemo(() => {
    if (mode !== "preview" || outgoingBody.trim().length === 0) {
      return {
        html: "",
        metadata: null,
        fileReferences: EMPTY_FILE_REFERENCES,
        loading: false,
        error: null,
      };
    }
    if (!enabled) {
      return {
        html: "",
        metadata: null,
        fileReferences: EMPTY_FILE_REFERENCES,
        loading: false,
        error: unsupportedText ?? t("composer.actionUnsupported"),
      };
    }

    try {
      const document = parseWorkspaceMessageBody(outgoingBody, { resolveMention });
      const rendered = renderWorkspaceMessageBody(document, COMPOSER_PREVIEW_RENDER_OPTIONS);

      return {
        html: rendered.html,
        metadata: rendered.metadata,
        fileReferences: collectWorkspaceMessageFileReferences(document),
        loading: false,
        error: null,
      };
    } catch {
      return {
        html: "",
        metadata: null,
        fileReferences: EMPTY_FILE_REFERENCES,
        loading: false,
        error: t("composer.previewError"),
      };
    }
  }, [enabled, mode, outgoingBody, resolveMention, unsupportedText]);
}
