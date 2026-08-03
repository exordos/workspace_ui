import type { WorkspaceUrnReference } from "../workspace-reference-urn.lib";
import type { TokensList } from "marked";

export type WorkspaceMessageContentKind =
  | "plain"
  | "inline-rich"
  | "block-rich"
  | "media"
  | "attachment";

export type WorkspaceMessageMetaPlacement = "inline" | "row";

/**
 * Kind of the last renderable top-level block.
 * Inline meta needs a text paragraph at the tail, everything else keeps the row footer.
 */
export type WorkspaceMessageLastBlockKind = "paragraph" | "quote-reference" | "block" | "none";

export interface WorkspaceMessageRenderOptions {
  enableMarkdown: boolean;
  enableMentions: boolean;
  enableQuotes: boolean;
  enableEmojiShortcodes: boolean;
  enableCodeHighlight: boolean;
  enableCodeCopy: boolean;
  enableProtectedMedia: boolean;
  enableAttachments: boolean;
  enableGallery: boolean;
}

export interface WorkspaceMessageBodyMetadata {
  contentKind: WorkspaceMessageContentKind;
  hasRichBlocks: boolean;
  hasMentions: boolean;
  hasLinks: boolean;
  hasCodeBlocks: boolean;
  hasMedia: boolean;
  hasProtectedMedia: boolean;
  hasAttachments: boolean;
  preferredMetaPlacement: WorkspaceMessageMetaPlacement;
  textPreview: string;
}

export interface WorkspaceMessageTextInline {
  kind: "text";
  text: string;
}

export interface WorkspaceMessageBreakInline {
  kind: "break";
}

export interface WorkspaceMessageEmphasisInline {
  kind: "emphasis";
  children: readonly WorkspaceMessageInline[];
}

export interface WorkspaceMessageStrongInline {
  kind: "strong";
  children: readonly WorkspaceMessageInline[];
}

export interface WorkspaceMessageCodeInline {
  kind: "code";
  text: string;
}

export interface WorkspaceMessageSpoilerInline {
  kind: "spoiler";
  children: readonly WorkspaceMessageInline[];
}

export interface WorkspaceMessageLinkInline {
  kind: "link";
  href: string;
  title?: string;
  workspaceMessageUuid?: string;
  workspaceReference?: Exclude<WorkspaceUrnReference, { kind: "user" }>;
  children: readonly WorkspaceMessageInline[];
}

export interface WorkspaceMessageMentionInline {
  kind: "mention";
  displayText: string;
  userUuid?: string;
  unresolved?: boolean;
}

export interface WorkspaceMessageEmojiInline {
  kind: "emoji";
  text: string;
  shortcode: string;
  unicode: string;
}

export type WorkspaceMessageFileContentKind = "media" | "attachment";
export type WorkspaceMessageMediaKind = "image" | "video";

export interface WorkspaceMessageFileReference {
  kind: WorkspaceMessageFileContentKind;
  href: string;
  fileUuid: string;
  name?: string;
  contentType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mediaKind?: WorkspaceMessageMediaKind;
}

export interface WorkspaceMessageFileInline {
  kind: "file";
  reference: WorkspaceMessageFileReference;
}

export interface WorkspaceMessageUnsupportedMediaInline {
  kind: "unsupported-media";
  label: string;
}

export type WorkspaceMessageInline =
  | WorkspaceMessageTextInline
  | WorkspaceMessageBreakInline
  | WorkspaceMessageEmphasisInline
  | WorkspaceMessageStrongInline
  | WorkspaceMessageCodeInline
  | WorkspaceMessageSpoilerInline
  | WorkspaceMessageLinkInline
  | WorkspaceMessageMentionInline
  | WorkspaceMessageEmojiInline
  | WorkspaceMessageFileInline
  | WorkspaceMessageUnsupportedMediaInline;

export interface WorkspaceMessageParagraphBlock {
  kind: "paragraph";
  children: readonly WorkspaceMessageInline[];
}

export interface WorkspaceMessageQuoteBlock {
  kind: "quote";
  blocks: readonly WorkspaceMessageBlock[];
}

export interface WorkspaceMessageQuoteReference {
  messageUuid: string;
  selectedText?: string;
  fallbackAuthorLabel: string;
}

export interface WorkspaceMessageQuoteReferenceBlock {
  kind: "quote-reference";
  reference: WorkspaceMessageQuoteReference;
}

export interface WorkspaceMessageCodeBlock {
  kind: "code";
  text: string;
  language?: string;
}

export interface WorkspaceMessageSpoilerBlock {
  kind: "spoiler";
  header: readonly WorkspaceMessageInline[];
  blocks: readonly WorkspaceMessageBlock[];
}

export interface WorkspaceMessageListItem {
  blocks: readonly WorkspaceMessageBlock[];
}

export interface WorkspaceMessageListBlock {
  kind: "list";
  ordered: boolean;
  start?: number;
  items: readonly WorkspaceMessageListItem[];
}

export type WorkspaceMessageBlock =
  | WorkspaceMessageParagraphBlock
  | WorkspaceMessageQuoteBlock
  | WorkspaceMessageQuoteReferenceBlock
  | WorkspaceMessageCodeBlock
  | WorkspaceMessageSpoilerBlock
  | WorkspaceMessageListBlock;

export interface WorkspaceMessageDocument {
  sourceMarkdown: string;
  /**
   * Full Marked token list. Parsing preserves its reference-definition `links`
   * map, while rendering consumes the already resolved inline link tokens.
   */
  markdownTokens: TokensList;
  blocks: readonly WorkspaceMessageBlock[];
  metadata: WorkspaceMessageBodyMetadata;
  safeTextPreview: string;
}

export interface WorkspaceMessageMentionResolution {
  displayText?: string | null;
  userUuid?: string | null;
  unresolved?: boolean;
}

export type WorkspaceMessageMentionResolver = (
  displayText: string,
) => WorkspaceMessageMentionResolution | null | undefined;

export interface WorkspaceMessageParseOptions {
  resolveMention?: WorkspaceMessageMentionResolver;
}

export interface WorkspaceMessageRenderResult {
  html: string;
  metadata: WorkspaceMessageBodyMetadata;
}

export interface WorkspaceMessageBodyHtmlSegment {
  kind: "html";
  html: string;
}

export interface WorkspaceMessageBodyQuoteSegment {
  kind: "quote";
  reference: WorkspaceMessageQuoteReference;
}

export type WorkspaceMessageBodySegment =
  | WorkspaceMessageBodyHtmlSegment
  | WorkspaceMessageBodyQuoteSegment;

export interface WorkspaceMessageSegmentRenderResult {
  segments: readonly WorkspaceMessageBodySegment[];
  metadata: WorkspaceMessageBodyMetadata;
}

export interface WorkspaceMessageSummaryOptions {
  maxLength: number;
  includeMediaLabel: boolean;
  includeAttachmentLabel: boolean;
  includeQuotePrefix: boolean;
}

export type WorkspaceMessageSummaryLeadingKind =
  | "text"
  | "image"
  | "video"
  | "file"
  | "link"
  | "quote"
  | "code";

export interface WorkspaceMessageSummary {
  text: string;
  leadingKind: WorkspaceMessageSummaryLeadingKind;
  iconName?: string;
}
