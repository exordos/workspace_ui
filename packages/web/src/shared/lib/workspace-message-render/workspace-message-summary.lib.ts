import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_SUMMARY_OPTIONS } from "./workspace-message-render-options.lib";
import type {
  WorkspaceMessageBlock,
  WorkspaceMessageDocument,
  WorkspaceMessageInline,
  WorkspaceMessageParseOptions,
  WorkspaceMessageSummary,
  WorkspaceMessageSummaryLeadingKind,
  WorkspaceMessageSummaryOptions,
} from "./workspace-message-document.types";

const TRUNCATION_MARKER = "...";
const WHITESPACE_PATTERN = /\s+/g;
const URL_ONLY_PATTERN = /^(?:https?:\/\/|mailto:)[^\s]+$/i;

interface SummaryBuildResult {
  text: string;
  leadingKind: WorkspaceMessageSummaryLeadingKind;
}

interface BlockSummaryBuildResult extends SummaryBuildResult {
  sourceKind: WorkspaceMessageBlock["kind"];
}

function truncatePreview(text: string, maxLength: number): string {
  const limit = Math.max(0, Math.floor(maxLength));
  const characters = Array.from(text);

  if (characters.length <= limit) {
    return text;
  }

  if (limit <= TRUNCATION_MARKER.length) {
    return characters.slice(0, limit).join("");
  }

  return `${characters
    .slice(0, limit - TRUNCATION_MARKER.length)
    .join("")
    .trimEnd()}${TRUNCATION_MARKER}`;
}

function normalizePreviewText(text: string): string {
  return text.replace(WHITESPACE_PATTERN, " ").trim();
}

function isReadableLinkLabel(label: string, href: string): boolean {
  const normalizedLabel = normalizePreviewText(label);
  return (
    normalizedLabel.length > 0 &&
    normalizedLabel !== href &&
    !URL_ONLY_PATTERN.test(normalizedLabel)
  );
}

function summarizeInline(
  inline: WorkspaceMessageInline,
  options: WorkspaceMessageSummaryOptions,
): SummaryBuildResult {
  switch (inline.kind) {
    case "text":
    case "code":
      return { text: inline.text, leadingKind: "text" };
    case "break":
      return { text: " ", leadingKind: "text" };
    case "emphasis":
    case "strong":
    case "spoiler":
      return summarizeInlineChildren(inline.children, options);
    case "mention":
      return { text: `@${inline.displayText}`, leadingKind: "text" };
    case "emoji":
      return { text: inline.unicode, leadingKind: "text" };
    case "unsupported-media":
      return {
        text: options.includeMediaLabel ? "Изображение" : inline.label,
        leadingKind: "image",
      };
    case "file": {
      const { reference } = inline;
      if (reference.kind === "media") {
        const mediaLabel = reference.mediaKind === "video" ? "Видео" : "Изображение";
        return {
          text: options.includeMediaLabel ? mediaLabel : (reference.name ?? mediaLabel),
          leadingKind: reference.mediaKind === "video" ? "video" : "image",
        };
      }
      return {
        text: options.includeAttachmentLabel
          ? `Файл${reference.name != null ? `: ${reference.name}` : ""}`
          : (reference.name ?? "Файл"),
        leadingKind: "file",
      };
    }
    case "link": {
      const childSummary = summarizeInlineChildren(inline.children, options);
      // В compact preview читаемый label важнее URL: ссылка не должна
      // раздувать сайдбар, если человек уже написал нормальный текст.
      if (isReadableLinkLabel(childSummary.text, inline.href)) {
        return { text: childSummary.text, leadingKind: "link" };
      }
      return {
        text: childSummary.text.length > 0 ? childSummary.text : inline.href,
        leadingKind: "link",
      };
    }
  }
}

function summarizeInlineChildren(
  children: readonly WorkspaceMessageInline[],
  options: WorkspaceMessageSummaryOptions,
): SummaryBuildResult {
  const parts = children.map((child) => summarizeInline(child, options));
  const leadingKind = parts.find((part) => part.text.trim().length > 0)?.leadingKind ?? "text";
  return {
    text: normalizePreviewText(parts.map((part) => part.text).join(" ")),
    leadingKind,
  };
}

function summarizeParagraph(
  block: Extract<WorkspaceMessageBlock, { kind: "paragraph" }>,
  options: WorkspaceMessageSummaryOptions,
): SummaryBuildResult {
  const parts = block.children.map((child) => summarizeInline(child, options));
  const firstPart = parts.find((part) => part.text.trim().length > 0);
  if (
    (firstPart?.leadingKind === "image" || firstPart?.leadingKind === "video") &&
    options.includeMediaLabel
  ) {
    const rest = normalizePreviewText(
      parts
        .slice(parts.indexOf(firstPart) + 1)
        .map((part) => part.text)
        .join(" "),
    );
    const mediaLabel = firstPart.leadingKind === "video" ? "Видео" : "Изображение";
    return {
      text: rest.length > 0 ? `${mediaLabel}: ${rest}` : mediaLabel,
      leadingKind: firstPart.leadingKind,
    };
  }
  return summarizeInlineChildren(block.children, options);
}

function summarizeBlock(
  block: WorkspaceMessageBlock,
  options: WorkspaceMessageSummaryOptions,
): SummaryBuildResult {
  switch (block.kind) {
    case "paragraph":
      return summarizeParagraph(block, options);
    case "quote": {
      const quote = summarizeBlocksInternal(
        block.blocks,
        { ...options, includeQuotePrefix: false },
        false,
      );
      return {
        text: options.includeQuotePrefix ? `Цитата: ${quote.text}` : quote.text,
        leadingKind: "quote",
      };
    }
    case "code":
      return {
        text: `Код: ${normalizePreviewText(block.text)}`,
        leadingKind: "code",
      };
    case "spoiler":
      return summarizeBlocks(block.blocks, options);
    case "list":
      return {
        text: block.items
          .map((item, index) => {
            const marker = block.ordered ? `${(block.start ?? 1) + index}.` : "•";
            return `${marker} ${summarizeBlocks(item.blocks, options).text}`;
          })
          .join(" "),
        leadingKind: "text",
      };
  }
}

function summarizeBlocks(
  blocks: readonly WorkspaceMessageBlock[],
  options: WorkspaceMessageSummaryOptions,
): SummaryBuildResult {
  return summarizeBlocksInternal(blocks, options, true);
}

function summarizeBlocksInternal(
  blocks: readonly WorkspaceMessageBlock[],
  options: WorkspaceMessageSummaryOptions,
  skipQuotesWhenOwnTextExists: boolean,
): SummaryBuildResult {
  const parts: BlockSummaryBuildResult[] = blocks.map((block) => ({
    ...summarizeBlock(block, options),
    sourceKind: block.kind,
  }));
  const ownParts = parts.filter(
    (part) => part.sourceKind !== "quote" && part.text.trim().length > 0,
  );
  // Если после цитаты есть собственный ответ, compact preview показывает
  // именно ответ. Иначе сайдбар забивается чужим quoted payload и перестает
  // помогать понять, что написал отправитель.
  const visibleParts = skipQuotesWhenOwnTextExists && ownParts.length > 0 ? ownParts : parts;
  const leadingKind =
    visibleParts.find((part) => part.text.trim().length > 0)?.leadingKind ?? "text";
  return {
    text: normalizePreviewText(visibleParts.map((part) => part.text).join(" ")),
    leadingKind,
  };
}

export function summarizeWorkspaceMessageBody(
  document: WorkspaceMessageDocument,
  options: WorkspaceMessageSummaryOptions = DEFAULT_WORKSPACE_MESSAGE_SUMMARY_OPTIONS,
): WorkspaceMessageSummary {
  // Сводка намеренно не возвращает HTML: сайдбар, уведомления и поиск должны
  // получать текст, а не урезанный bubble-render.
  const summary = summarizeBlocks(document.blocks, options);
  return {
    text: truncatePreview(summary.text, options.maxLength),
    leadingKind: summary.leadingKind,
  };
}

export function summarizeWorkspaceMessageMarkdown(
  markdown: string,
  options: WorkspaceMessageSummaryOptions = DEFAULT_WORKSPACE_MESSAGE_SUMMARY_OPTIONS,
  parseOptions: WorkspaceMessageParseOptions = {},
): WorkspaceMessageSummary {
  // Compact surfaces получают готовый markdown body и не должны заводить свои
  // preview-парсеры. Этот helper сохраняет единый путь: parse -> summary.
  return summarizeWorkspaceMessageBody(parseWorkspaceMessageBody(markdown, parseOptions), options);
}
