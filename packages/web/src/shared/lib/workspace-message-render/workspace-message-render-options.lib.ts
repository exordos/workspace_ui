import type {
  WorkspaceMessageRenderOptions,
  WorkspaceMessageSummaryOptions,
} from "./workspace-message-document.types";

export const DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS = {
  enableMarkdown: true,
  enableMentions: false,
  enableQuotes: true,
  enableEmojiShortcodes: true,
  enableCodeHighlight: false,
  enableCodeCopy: false,
  enableProtectedMedia: false,
  enableAttachments: false,
  enableGallery: false,
} as const satisfies WorkspaceMessageRenderOptions;

export const DEFAULT_WORKSPACE_MESSAGE_SUMMARY_OPTIONS = {
  maxLength: 120,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: true,
} as const satisfies WorkspaceMessageSummaryOptions;
