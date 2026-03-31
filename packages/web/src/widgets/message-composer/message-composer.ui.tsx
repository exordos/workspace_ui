import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useState, useRef, useMemo, useCallback } from "react";
import { buildStickerMarkdown } from "~/entities/sticker/sticker.api";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import type { AiMessageContext, AiReplyRequest } from "~/features/ai-reply/ai-reply.types";
import { AiActionMenu, AiComposerButton, SmartReplySuggestions } from "~/features/ai-reply/ai-reply.ui";
import { filterUsers } from "~/features/mention-suggest/mention-suggest.lib";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";
import { StickerPicker } from "~/features/sticker-picker/sticker-picker.ui";
import { t } from "~/i18n/i18n";
import { createSavedSnippet, fetchSavedSnippets } from "~/shared/api/zulip-messages";
import { getRealmBaseUrl, type SavedSnippet } from "~/shared/api/zulip";
import { SCROLL_AREA_CLASS } from "~/shared/config/constants";
import { getPresenceState } from "~/shared/lib/format";
import { sanitizeHtml, stripHtml } from "~/shared/lib/html";
import { useViewportKeyboard } from "~/shared/lib/touch";
import { isWebView } from "~/shared/lib/webview";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { resolveComposerKeyboardInsetPx } from "./message-composer-keyboard-inset.lib";
import { computeFloatingPickerPosition } from "./message-composer-picker-position.lib";
import { useMessageComposerPreview } from "./use-message-composer-preview.hook";
import { useMessageComposerUpload } from "./use-message-composer-upload.hook";

export interface ReplyQuote {
  id: number;
  content: string;
  sender_full_name: string;
}

interface ComposerUploadProgress {
  completed: number;
  total: number;
  activeFileName: string | null;
}

interface ScheduledComposerMessage {
  id: string;
  content: string;
  subject: string;
  files: File[];
  sendAt: number;
}

interface MessageComposerProps {
  onSend?: (content: string, subject?: string, files?: File[]) => void | Promise<void>;
  onCreateCallLink?: () => string | null;
  onCancelUpload?: () => void;
  disabled?: boolean;
  uploadProgress?: ComposerUploadProgress | null;
  placeholder?: string;
  /** Topic comes from the sidebar selection, not chosen in the composer */
  activeTopic?: string;
  /** Reply quote (shown above the input, prepended to the body on send) */
  replyQuote?: ReplyQuote | null;
  onClearReply?: () => void;
  /** Pre-fill the composer (e.g. from a saved draft) */
  initialValue?: string;
  /** Called whenever the composer text changes (for draft persistence) */
  onValueChange?: (value: string) => void;
  /** Trigger edit mode for the latest own message when composer is empty. */
  onEditLastMessage?: () => void;
  /** Recent chat messages used as AI context. */
  aiMessagesContext?: AiMessageContext[];
  /** Current chat metadata used by AI provider. */
  aiChatContext?: AiReplyRequest["chatContext"];
}

const TOOLBAR_BTN =
  "flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary";
const TOOLBAR_GLYPH = "select-none text-[11px] font-medium leading-none text-current";
const MODE_TAB_BTN = "flex h-7 w-7 items-center justify-center rounded transition-colors";
const MODE_TAB_ACTIVE = "bg-accent text-on-accent";
const MODE_TAB_INACTIVE = "text-composer-icon hover:bg-bg-elevated/60 hover:text-text-primary";

interface SelectionMutation {
  text: string;
  selectionStartOffset: number;
  selectionEndOffset: number;
}

function mutateSelection(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onValueChange: (value: string) => void,
  mutate: (selected: string) => SelectionMutation,
): void {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end);
  const mutation = mutate(selected);
  const nextValue = text.slice(0, start) + mutation.text + text.slice(end);
  onValueChange(nextValue);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(
      start + mutation.selectionStartOffset,
      start + mutation.selectionEndOffset,
    );
  });
}

function wrapSelection(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  marker: string,
  onValueChange: (value: string) => void,
) {
  mutateSelection(textareaRef, onValueChange, (selected) => {
    if (selected.length > 0) {
      return {
        text: `${marker}${selected}${marker}`,
        selectionStartOffset: marker.length + selected.length + marker.length,
        selectionEndOffset: marker.length + selected.length + marker.length,
      };
    }
    return {
      text: `${marker}${marker}`,
      selectionStartOffset: marker.length,
      selectionEndOffset: marker.length,
    };
  });
}

const FormattingToolbar = React.memo(function FormattingToolbar({
  textareaRef,
  onValueChange,
  fileTrigger,
  callLinkTrigger,
  scheduleTrigger,
  snippetsTrigger,
  aiTrigger,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onValueChange: (value: string) => void;
  fileTrigger?: React.ReactNode;
  callLinkTrigger?: React.ReactNode;
  scheduleTrigger?: React.ReactNode;
  snippetsTrigger?: React.ReactNode;
  aiTrigger?: React.ReactNode;
}) {
  const wrap = useCallback(
    (marker: string) => wrapSelection(textareaRef, marker, onValueChange),
    [textareaRef, onValueChange],
  );
  const quote = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const quoted = selected
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return {
          text: quoted,
          selectionStartOffset: quoted.length,
          selectionEndOffset: quoted.length,
        };
      }
      return {
        text: "> ",
        selectionStartOffset: 2,
        selectionEndOffset: 2,
      };
    });
  }, [onValueChange, textareaRef]);
  const codeBlock = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const block = `\`\`\`\n${selected}\n\`\`\``;
        return {
          text: block,
          selectionStartOffset: block.length,
          selectionEndOffset: block.length,
        };
      }
      return {
        text: "```\n\n```",
        selectionStartOffset: 4,
        selectionEndOffset: 4,
      };
    });
  }, [onValueChange, textareaRef]);
  const bulletedList = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const list = selected
          .split("\n")
          .map((line) => `- ${line}`)
          .join("\n");
        return {
          text: list,
          selectionStartOffset: list.length,
          selectionEndOffset: list.length,
        };
      }
      return {
        text: "- ",
        selectionStartOffset: 2,
        selectionEndOffset: 2,
      };
    });
  }, [onValueChange, textareaRef]);
  const numberedList = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const list = selected
          .split("\n")
          .map((line, index) => `${index + 1}. ${line}`)
          .join("\n");
        return {
          text: list,
          selectionStartOffset: list.length,
          selectionEndOffset: list.length,
        };
      }
      return {
        text: "1. ",
        selectionStartOffset: 3,
        selectionEndOffset: 3,
      };
    });
  }, [onValueChange, textareaRef]);
  const link = useCallback(() => {
    mutateSelection(textareaRef, onValueChange, (selected) => {
      if (selected.length > 0) {
        const linkText = `[${selected}](https://)`;
        const urlStart = linkText.indexOf("https://");
        return {
          text: linkText,
          selectionStartOffset: urlStart,
          selectionEndOffset: linkText.length - 1,
        };
      }
      const fallback = `[${t("composer.linkText")}](https://)`;
      const urlStart = fallback.indexOf("https://");
      return {
        text: fallback,
        selectionStartOffset: urlStart,
        selectionEndOffset: fallback.length - 1,
      };
    });
  }, [onValueChange, textareaRef]);
  const hasMediaActions = fileTrigger != null || callLinkTrigger != null;
  const hasAssistActions = scheduleTrigger != null || snippetsTrigger != null || aiTrigger != null;

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0.5 py-1"
      role="toolbar"
      aria-label={t("a11y.messageComposer")}
    >
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("**")}
        title={t("composer.bold")}
        aria-label={t("composer.bold")}
      >
        <span className={`${TOOLBAR_GLYPH} font-semibold`}>B</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("*")}
        title={t("composer.italic")}
        aria-label={t("composer.italic")}
      >
        <span className={`${TOOLBAR_GLYPH} italic`}>I</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("~~")}
        title={t("composer.strikethrough")}
        aria-label={t("composer.strikethrough")}
      >
        <span className={`${TOOLBAR_GLYPH} line-through`}>S</span>
      </button>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={quote}
        title={t("composer.quote")}
        aria-label={t("composer.quote")}
      >
        <span className={`${TOOLBAR_GLYPH} font-semibold`}>&gt;</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={bulletedList}
        title={t("composer.bulletedList")}
        aria-label={t("composer.bulletedList")}
      >
        <Icon name="list_bulleted" size={14} className="text-current" />
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={numberedList}
        title={t("composer.numberedList")}
        aria-label={t("composer.numberedList")}
      >
        <span className={TOOLBAR_GLYPH}>1.</span>
      </button>
      <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("`")}
        title={t("composer.code")}
        aria-label={t("composer.code")}
      >
        <span className="font-mono text-[11px] leading-none text-current">&lt;/&gt;</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={() => wrap("||")}
        title={t("composer.spoiler")}
        aria-label={t("composer.spoiler")}
      >
        <span className="font-mono text-[11px] leading-none text-current">||</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={codeBlock}
        title={t("composer.codeBlock")}
        aria-label={t("composer.codeBlock")}
      >
        <span className="font-mono text-[11px] leading-none text-current">{"{ }"}</span>
      </button>
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={link}
        title={t("composer.link")}
        aria-label={t("composer.link")}
      >
        <Icon name="links" size={14} className="text-current" />
      </button>
      {(hasMediaActions || hasAssistActions) && (
        <>
          <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          {fileTrigger}
          {callLinkTrigger}
          {hasMediaActions && hasAssistActions && (
            <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
          )}
          {scheduleTrigger}
          {snippetsTrigger}
          {aiTrigger}
        </>
      )}
    </div>
  );
});

type ComposerMode = "write" | "preview";
type MediaPickerTab = "emoji" | "sticker";

const ComposerModeTabs = React.memo(function ComposerModeTabs({
  mode,
  onChange,
}: {
  mode: ComposerMode;
  onChange: (mode: ComposerMode) => void;
}) {
  return (
    <div className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-card-bg p-0.5">
      <button
        type="button"
        className={`${MODE_TAB_BTN} ${mode === "write" ? MODE_TAB_ACTIVE : MODE_TAB_INACTIVE}`}
        onClick={() => onChange("write")}
        aria-label={t("composer.write")}
        title={t("composer.write")}
      >
        <Icon name="pen" size={16} className="text-current" />
      </button>
      <button
        type="button"
        className={`${MODE_TAB_BTN} ${mode === "preview" ? MODE_TAB_ACTIVE : MODE_TAB_INACTIVE}`}
        onClick={() => onChange("preview")}
        aria-label={t("composer.preview")}
        title={t("composer.preview")}
      >
        <Icon name="visibility" size={16} className="text-current" />
      </button>
    </div>
  );
});

const QUOTE_PREVIEW_MAX = 80;
const EMOJI_PICKER_WIDTH = 320;
const EMOJI_PICKER_HEIGHT = 360;
const STICKER_PICKER_WIDTH = 340;
const STICKER_PICKER_HEIGHT = 360;
const SCHEDULE_MENU_WIDTH = 220;
const SCHEDULE_MENU_HEIGHT = 210;
const SAVED_SNIPPETS_MENU_WIDTH = 360;
const SAVED_SNIPPETS_MENU_HEIGHT = 380;
const MEDIA_PICKER_CONTENT_HEIGHT = 320;
const COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 40;
const COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 128;
const SCHEDULE_RETRY_DELAY_MS = 30_000;

const SavedSnippetRow = React.memo(function SavedSnippetRow({
  snippet,
  onSelect,
}: {
  snippet: SavedSnippet;
  onSelect: (snippet: SavedSnippet) => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-bg"
      onClick={() => onSelect(snippet)}
      aria-label={snippet.title}
      title={snippet.title}
    >
      <p className="truncate text-sm font-medium text-text-primary">{snippet.title}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{snippet.content}</p>
    </button>
  );
});
SavedSnippetRow.displayName = "SavedSnippetRow";

function buildOutgoingMessageBody(value: string, replyQuote?: ReplyQuote | null): string {
  let body = value.trim();
  if (replyQuote) {
    const quoteBlock = `> **${replyQuote.sender_full_name}:**\n\n${replyQuote.content}\n\n`;
    body = quoteBlock + body;
  }
  return body;
}

function getAttachmentExtensionLabel(fileName: string): string {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? (parts.at(-1) ?? "") : "";
  const normalized = extension.trim().toUpperCase();
  if (normalized.length === 0) return "FILE";
  return normalized.slice(0, 4);
}

function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${Math.round(sizeBytes / (1024 * 1024))} MB`;
  return `${Math.round(sizeBytes / (1024 * 1024 * 1024))} GB`;
}

function getFloatingPickerStyle(
  anchor: HTMLButtonElement | null,
  pickerWidth: number,
  pickerHeight: number,
): React.CSSProperties {
  if (typeof window === "undefined") return {};
  const { left, top, width } = computeFloatingPickerPosition({
    anchorRect: anchor?.getBoundingClientRect() ?? null,
    pickerWidth,
    pickerHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  return { left, top, width };
}

function resolveTomorrowMorningTimestamp(baseTimeMs: number): number {
  const nextMorning = new Date(baseTimeMs);
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(9, 0, 0, 0);
  return nextMorning.getTime();
}

function formatScheduledTimestamp(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onCreateCallLink,
  onCancelUpload,
  disabled = false,
  uploadProgress,
  placeholder = t("chat.sendPlaceholder"),
  activeTopic,
  replyQuote,
  onClearReply,
  initialValue,
  onValueChange,
  onEditLastMessage,
  aiMessagesContext,
  aiChatContext,
}) => {
  const [mode, setMode] = useState<ComposerMode>("write");
  const [value, setValue] = useState(initialValue ?? "");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("emoji");
  const [mediaPickerStyle, setMediaPickerStyle] = useState<React.CSSProperties>({});
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false);
  const [scheduleMenuStyle, setScheduleMenuStyle] = useState<React.CSSProperties>({});
  const [savedSnippetsMenuOpen, setSavedSnippetsMenuOpen] = useState(false);
  const [savedSnippetsMenuStyle, setSavedSnippetsMenuStyle] = useState<React.CSSProperties>({});
  const [savedSnippets, setSavedSnippets] = useState<SavedSnippet[]>([]);
  const [savedSnippetsFilter, setSavedSnippetsFilter] = useState("");
  const [savedSnippetsLoading, setSavedSnippetsLoading] = useState(false);
  const [savedSnippetsError, setSavedSnippetsError] = useState<string | null>(null);
  const [savedSnippetCreateMode, setSavedSnippetCreateMode] = useState(false);
  const [savedSnippetTitle, setSavedSnippetTitle] = useState("");
  const [savedSnippetContent, setSavedSnippetContent] = useState("");
  const [savedSnippetSaving, setSavedSnippetSaving] = useState(false);
  const [savedSnippetsReloadToken, setSavedSnippetsReloadToken] = useState(0);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledComposerMessage[]>([]);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const mentionQuery = useMentionSuggestStore((s) => s.query);
  const mentionSuggestions = useMentionSuggestStore((s) => s.results);
  const showMentions = useMentionSuggestStore((s) => s.visible);
  const setMentionQuery = useMentionSuggestStore((s) => s.setQuery);
  const setMentionResults = useMentionSuggestStore((s) => s.setResults);
  const showMentionDropdown = useMentionSuggestStore((s) => s.show);
  const hideMentionDropdown = useMentionSuggestStore((s) => s.hide);
  const clearMentionState = useMentionSuggestStore((s) => s.clear);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const savedSnippetsButtonRef = useRef<HTMLButtonElement>(null);
  const scheduledSendInFlightRef = useRef(false);
  const isWebViewMode = useMemo(() => isWebView(), []);
  const viewportKeyboard = useViewportKeyboard();
  const composerKeyboardInset = useMemo(
    () =>
      resolveComposerKeyboardInsetPx({
        isWebViewMode,
        isKeyboardOpen: viewportKeyboard.isOpen,
        keyboardHeight: viewportKeyboard.keyboardHeight,
      }),
    [isWebViewMode, viewportKeyboard.isOpen, viewportKeyboard.keyboardHeight],
  );

  const initialValueRef = React.useRef(initialValue);
  React.useEffect(() => {
    if (initialValue !== initialValueRef.current) {
      initialValueRef.current = initialValue;
      setValue(initialValue ?? "");
    }
  }, [initialValue]);
  const {
    files,
    setFiles,
    filePreviewUrls,
    isDragOver,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onFileInputChange: handleFileChange,
    removeFileByIndex: removeFile,
    uploadProgressPercent,
    isUploadInProgress,
  } = useMessageComposerUpload({ disabled, uploadProgress });
  const [isComposerFocusWithin, setIsComposerFocusWithin] = useState(false);
  const outgoingBody = useMemo(
    () => buildOutgoingMessageBody(value, replyQuote),
    [value, replyQuote],
  );
  const preview = useMessageComposerPreview({ mode, outgoingBody });
  const scheduleOptions = useMemo(
    () => [
      {
        id: "10m",
        label: "10m",
        resolveSendAt: (nowMs: number) => nowMs + 10 * 60 * 1000,
      },
      {
        id: "30m",
        label: "30m",
        resolveSendAt: (nowMs: number) => nowMs + 30 * 60 * 1000,
      },
      {
        id: "1h",
        label: "1h",
        resolveSendAt: (nowMs: number) => nowMs + 60 * 60 * 1000,
      },
      {
        id: "tomorrow-morning",
        label: "09:00",
        resolveSendAt: (nowMs: number) => resolveTomorrowMorningTimestamp(nowMs),
      },
    ],
    [],
  );
  const filteredSavedSnippets = useMemo(() => {
    const normalizedFilter = savedSnippetsFilter.trim().toLowerCase();
    const snippets = [...savedSnippets].sort((left, right) =>
      left.title.localeCompare(right.title),
    );
    if (normalizedFilter.length === 0) {
      return snippets;
    }
    return snippets.filter((snippet) => {
      const haystack = `${snippet.title}\n${snippet.content}`.toLowerCase();
      return haystack.includes(normalizedFilter);
    });
  }, [savedSnippets, savedSnippetsFilter]);
  const canSaveSnippet = useMemo(
    () =>
      !savedSnippetSaving &&
      savedSnippetTitle.trim().length > 0 &&
      savedSnippetContent.trim().length > 0,
    [savedSnippetContent, savedSnippetSaving, savedSnippetTitle],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applyFormattingShortcut = useCallback(
    (marker: string) => {
      wrapSelection(textareaRef, marker, (nextValue) => {
        setValue(nextValue);
        onValueChange?.(nextValue);
      });
    },
    [onValueChange],
  );

  void filePreviewUrls;

  const allUsers = useUsersStore((s) => s.users);
  const mentionUsers: MentionSuggestion[] = useMemo(
    () =>
      Array.from(allUsers.values()).map((u) => ({
        userId: u.user_id,
        fullName: u.full_name,
        email: u.email ?? "",
        avatarUrl: u.avatar_url ?? undefined,
      })),
    [allUsers],
  );

  React.useEffect(() => {
    if (!showMentions) return;
    setMentionResults(filterUsers(mentionQuery, mentionUsers));
  }, [showMentions, mentionQuery, mentionUsers, setMentionResults]);

  React.useEffect(() => {
    if (!showMentions) {
      setActiveMentionIndex(0);
      return;
    }
    if (activeMentionIndex >= mentionSuggestions.length) {
      setActiveMentionIndex(0);
    }
  }, [showMentions, activeMentionIndex, mentionSuggestions.length]);

  React.useEffect(() => clearMentionState, [clearMentionState]);

  const previewHtml = preview.html;
  const previewLoading = preview.loading;
  const previewError = preview.error;

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const before = text.slice(0, cursorPos);
      const match = /@(\S*)$/.exec(before);
      if (match) {
        setMentionQuery(match[1] ?? "");
        setMentionStartPos(cursorPos - (match[0]?.length ?? 0));
        showMentionDropdown();
        setActiveMentionIndex(0);
      } else {
        hideMentionDropdown();
      }
    },
    [hideMentionDropdown, setMentionQuery, showMentionDropdown],
  );

  const handleMentionSelect = useCallback(
    (user: MentionSuggestion) => {
      const before = value.slice(0, mentionStartPos);
      const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
      const mention = `@**${user.fullName}** `;
      const next = before + mention + after;
      setValue(next);
      onValueChange?.(next);
      hideMentionDropdown();
      setActiveMentionIndex(0);
      const newCursorPos = before.length + mention.length;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [value, mentionStartPos, onValueChange, hideMentionDropdown],
  );

  const clearComposerInput = useCallback(() => {
    if (replyQuote) {
      onClearReply?.();
    }
    setValue("");
    onValueChange?.("");
    setFiles([]);
  }, [onClearReply, onValueChange, replyQuote]);

  const scheduleMessage = useCallback(
    (sendAt: number) => {
      const hasText = value.trim().length > 0;
      const hasFiles = files.length > 0;
      if ((!hasText && !hasFiles) || disabled || onSend == null) return;

      const subject = activeTopic ?? "general";
      const scheduledMessage: ScheduledComposerMessage = {
        id: crypto.randomUUID(),
        content: outgoingBody,
        subject,
        files: hasFiles ? [...files] : [],
        sendAt,
      };

      setScheduledMessages((prev) => [...prev, scheduledMessage]);
      setScheduleMenuOpen(false);
      clearComposerInput();
    },
    [activeTopic, clearComposerInput, disabled, files, onSend, outgoingBody, value],
  );

  const cancelScheduledMessage = useCallback((id: string) => {
    setScheduledMessages((prev) => prev.filter((message) => message.id !== id));
  }, []);

  const processDueScheduledMessage = useCallback(async () => {
    if (disabled || scheduledSendInFlightRef.current || onSend == null) return;

    const now = Date.now();
    const dueMessage = [...scheduledMessages]
      .filter((message) => message.sendAt <= now)
      .sort((left, right) => left.sendAt - right.sendAt)[0];

    if (dueMessage == null) return;

    scheduledSendInFlightRef.current = true;
    try {
      await onSend(
        dueMessage.content,
        dueMessage.subject,
        dueMessage.files.length > 0 ? dueMessage.files : undefined,
      );
      setScheduledMessages((prev) => prev.filter((message) => message.id !== dueMessage.id));
    } catch {
      setScheduledMessages((prev) =>
        prev.map((message) =>
          message.id === dueMessage.id
            ? { ...message, sendAt: Date.now() + SCHEDULE_RETRY_DELAY_MS }
            : message,
        ),
      );
    } finally {
      scheduledSendInFlightRef.current = false;
    }
  }, [disabled, onSend, scheduledMessages]);

  const handleSend = async () => {
    const hasText = value.trim().length > 0;
    const hasFiles = files.length > 0;
    if ((!hasText && !hasFiles) || disabled) return;
    const subject = activeTopic ?? "general";
    try {
      await onSend?.(outgoingBody, subject, hasFiles ? files : undefined);
    } catch {
      return;
    }
    setAiMenuOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setMediaPickerOpen(false);
    clearComposerInput();
  };

  const handleEmojiClick = (data: EmojiClickData) => {
    const emoji = data.emoji ?? "";
    if (emoji.length === 0) return;
    setValue((prev) => {
      const next = prev + emoji;
      onValueChange?.(next);
      return next;
    });
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const cursorPosition = textarea.value.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      setFiles((prev) => [...prev, ...imageFiles]);
    }
  }, []);

  const handleAttachClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleCreateCallLink = useCallback(() => {
    if (disabled || onCreateCallLink == null) {
      return;
    }
    const callLink = onCreateCallLink()?.trim();
    if (callLink == null || callLink.length === 0) {
      return;
    }

    setValue((prev) => {
      const needsLineBreak = prev.length > 0 && !prev.endsWith("\n");
      const next = needsLineBreak ? `${prev}\n${callLink}` : `${prev}${callLink}`;
      onValueChange?.(next);
      return next;
    });
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }, [disabled, onCreateCallLink, onValueChange]);

  const resizeTextareaToContent = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, COMPOSER_TEXTAREA_MIN_HEIGHT_PX),
      COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
    );
    textarea.style.height = `${nextHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    if (mode !== "write") return;
    resizeTextareaToContent();
  }, [mode, resizeTextareaToContent, value]);

  const updateMediaPickerPosition = useCallback((tab: MediaPickerTab) => {
    const anchor = emojiButtonRef.current;
    const pickerWidth = tab === "emoji" ? EMOJI_PICKER_WIDTH : STICKER_PICKER_WIDTH;
    const pickerHeight = tab === "emoji" ? EMOJI_PICKER_HEIGHT : STICKER_PICKER_HEIGHT;
    setMediaPickerStyle(getFloatingPickerStyle(anchor, pickerWidth, pickerHeight));
  }, []);

  React.useEffect(() => {
    if (!mediaPickerOpen) return;
    updateMediaPickerPosition(mediaPickerTab);
    const handleWindowChange = () => updateMediaPickerPosition(mediaPickerTab);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [mediaPickerOpen, mediaPickerTab, updateMediaPickerPosition]);

  const toggleMediaPicker = useCallback(
    (tab: MediaPickerTab) => {
      const shouldCloseCurrentTab = mediaPickerOpen && mediaPickerTab === tab;
      if (shouldCloseCurrentTab) {
        setMediaPickerOpen(false);
        return;
      }
      setMediaPickerTab(tab);
      setAiMenuOpen(false);
      setScheduleMenuOpen(false);
      setSavedSnippetsMenuOpen(false);
      setMediaPickerOpen(true);
      updateMediaPickerPosition(tab);
    },
    [mediaPickerOpen, mediaPickerTab, updateMediaPickerPosition],
  );

  const updateScheduleMenuPosition = useCallback(() => {
    setScheduleMenuStyle(
      getFloatingPickerStyle(scheduleButtonRef.current, SCHEDULE_MENU_WIDTH, SCHEDULE_MENU_HEIGHT),
    );
  }, []);

  React.useEffect(() => {
    if (!scheduleMenuOpen) return;
    updateScheduleMenuPosition();
    const handleWindowChange = () => updateScheduleMenuPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [scheduleMenuOpen, updateScheduleMenuPosition]);

  const toggleScheduleMenu = useCallback(() => {
    setScheduleMenuOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        setAiMenuOpen(false);
        setMediaPickerOpen(false);
        setSavedSnippetsMenuOpen(false);
        updateScheduleMenuPosition();
      }
      return nextOpen;
    });
  }, [updateScheduleMenuPosition]);

  const insertSavedSnippet = useCallback(
    (snippet: SavedSnippet) => {
      const content = snippet.content;
      if (content.trim().length === 0) return;

      const textarea = textareaRef.current;
      if (!textarea) {
        setValue((prev) => {
          const next = prev + content;
          onValueChange?.(next);
          return next;
        });
        setSavedSnippetsMenuOpen(false);
        return;
      }

      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const nextValue = value.slice(0, selectionStart) + content + value.slice(selectionEnd);
      setValue(nextValue);
      onValueChange?.(nextValue);
      setSavedSnippetsMenuOpen(false);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = selectionStart + content.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [onValueChange, value],
  );

  const updateSavedSnippetsMenuPosition = useCallback(() => {
    setSavedSnippetsMenuStyle(
      getFloatingPickerStyle(
        savedSnippetsButtonRef.current,
        SAVED_SNIPPETS_MENU_WIDTH,
        SAVED_SNIPPETS_MENU_HEIGHT,
      ),
    );
  }, []);

  React.useEffect(() => {
    if (!savedSnippetsMenuOpen) return;
    updateSavedSnippetsMenuPosition();
    const handleWindowChange = () => updateSavedSnippetsMenuPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [savedSnippetsMenuOpen, updateSavedSnippetsMenuPosition]);

  React.useEffect(() => {
    if (!savedSnippetsMenuOpen || savedSnippetCreateMode) return;
    let cancelled = false;
    setSavedSnippetsLoading(true);
    setSavedSnippetsError(null);
    void fetchSavedSnippets()
      .then((snippets) => {
        if (cancelled) return;
        setSavedSnippets(snippets);
      })
      .catch(() => {
        if (cancelled) return;
        setSavedSnippets([]);
        setSavedSnippetsError(t("composer.savedSnippetsLoadError"));
      })
      .finally(() => {
        if (cancelled) return;
        setSavedSnippetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [savedSnippetCreateMode, savedSnippetsMenuOpen, savedSnippetsReloadToken]);

  const toggleSavedSnippetsMenu = useCallback(() => {
    setSavedSnippetsMenuOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        setAiMenuOpen(false);
        setMediaPickerOpen(false);
        setScheduleMenuOpen(false);
        setSavedSnippetCreateMode(false);
        setSavedSnippetsFilter("");
        setSavedSnippetsError(null);
        updateSavedSnippetsMenuPosition();
      }
      return nextOpen;
    });
  }, [updateSavedSnippetsMenuPosition]);

  const startCreateSavedSnippet = useCallback(() => {
    setSavedSnippetCreateMode(true);
    setSavedSnippetTitle(savedSnippetsFilter.trim());
    setSavedSnippetContent(value.trim());
  }, [savedSnippetsFilter, value]);

  const cancelCreateSavedSnippet = useCallback(() => {
    setSavedSnippetCreateMode(false);
    setSavedSnippetTitle("");
    setSavedSnippetContent("");
  }, []);

  const submitCreateSavedSnippet = useCallback(async () => {
    if (!canSaveSnippet) return;
    setSavedSnippetSaving(true);
    setSavedSnippetsError(null);
    try {
      await createSavedSnippet({
        title: savedSnippetTitle.trim(),
        content: savedSnippetContent.trim(),
      });
      setSavedSnippetCreateMode(false);
      setSavedSnippetTitle("");
      setSavedSnippetContent("");
      setSavedSnippetsFilter("");
      setSavedSnippetsReloadToken((version) => version + 1);
    } catch {
      setSavedSnippetsError(t("composer.savedSnippetsCreateError"));
    } finally {
      setSavedSnippetSaving(false);
    }
  }, [canSaveSnippet, savedSnippetContent, savedSnippetTitle]);

  React.useEffect(() => {
    void processDueScheduledMessage();
    if (scheduledMessages.length === 0) return;
    const intervalId = window.setInterval(() => {
      void processDueScheduledMessage();
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [processDueScheduledMessage, scheduledMessages.length]);

  const isToolbarVisible = isComposerFocusWithin || value.length > 0 || mode === "preview";

  const handleComposerFocusCapture = useCallback(() => {
    setIsComposerFocusWithin(true);
  }, []);

  const handleComposerBlurCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }
    setIsComposerFocusWithin(false);
  }, []);

  return (
    <div
      className={`flex-shrink-0 border-t border-border-subtle bg-composer-outer ${isDragOver ? "ring-2 ring-inset ring-accent" : ""}`}
      data-focus-zone="composer"
      role="form"
      aria-label={t("a11y.messageComposer")}
      style={
        composerKeyboardInset > 0 ? { paddingBottom: `${composerKeyboardInset}px` } : undefined
      }
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onFocusCapture={handleComposerFocusCapture}
      onBlurCapture={handleComposerBlurCapture}
    >
      {uploadProgress != null && uploadProgress.total > 0 && (
        <div className="px-4 pb-1 pt-2">
          <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
            <span>
              {t("composer.uploadingFilesProgress", {
                completed: uploadProgress.completed,
                total: uploadProgress.total,
              })}
            </span>
            <span>{uploadProgressPercent}%</span>
          </div>
          {uploadProgress.activeFileName != null && uploadProgress.activeFileName.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {uploadProgress.activeFileName}
            </p>
          )}
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-elevated"
            role="progressbar"
            aria-label={t("composer.uploadingFilesAriaLabel")}
            aria-valuemin={0}
            aria-valuemax={uploadProgress.total}
            aria-valuenow={uploadProgress.completed}
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${uploadProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Attached files */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          {files.map((file, i) => {
            const previewUrl = filePreviewUrls[i] ?? null;
            const isImage = file.type.startsWith("image/");
            const canCancelUpload = isUploadInProgress && onCancelUpload != null;
            return (
              <span
                key={`${file.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 py-1 text-xs text-text-primary"
              >
                {previewUrl != null ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="h-8 w-8 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-bg-elevated px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {getAttachmentExtensionLabel(file.name)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block max-w-[120px] truncate" title={file.name}>
                    {file.name}
                  </span>
                  {!isImage && (
                    <span className="block text-[10px] text-text-muted">
                      {formatAttachmentSize(file.size)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (canCancelUpload) {
                      onCancelUpload();
                      return;
                    }
                    removeFile(i);
                  }}
                  className="rounded p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                  aria-label={canCancelUpload ? t("composer.cancelUpload") : t("common.delete")}
                  title={canCancelUpload ? t("composer.cancelUpload") : t("common.delete")}
                >
                  <Icon
                    name="close"
                    size={12}
                    className={canCancelUpload ? "text-notice-base" : undefined}
                  />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {scheduledMessages.length > 0 && (
        <div className="px-4 pb-2">
          <div className="space-y-1 rounded-lg border border-border-subtle bg-bg px-2 py-2">
            {[...scheduledMessages]
              .sort((left, right) => left.sendAt - right.sendAt)
              .map((message) => (
                <div
                  key={message.id}
                  className="flex items-center gap-2 rounded-md bg-bg-elevated px-2 py-1"
                >
                  <Icon name="calendar" size={14} className="text-text-muted" />
                  <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                    {formatScheduledTimestamp(message.sendAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelScheduledMessage(message.id)}
                    className="rounded p-0.5 text-text-muted hover:bg-bg hover:text-text-primary"
                    aria-label={t("common.cancel")}
                    title={t("common.cancel")}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {replyQuote && (
        <div className="bg-bg/50 flex items-start gap-2 border-b border-border-subtle px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">
              {t("message.replyTo")}: {replyQuote.sender_full_name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-text-primary">
              {stripHtml(replyQuote.content).trim().length <= QUOTE_PREVIEW_MAX
                ? stripHtml(replyQuote.content).trim()
                : stripHtml(replyQuote.content).trim().slice(0, QUOTE_PREVIEW_MAX) + "…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="flex-shrink-0 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label={t("common.cancel")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* Smart reply suggestions */}
      <SmartReplySuggestions
        onAccept={(text) => {
          setValue(text);
          onValueChange?.(text);
        }}
      />

      <div
        data-testid="composer-toolbar-row"
        aria-hidden={!isToolbarVisible}
        className={`overflow-hidden px-3 transition-[max-height,opacity,transform,padding] duration-200 ease-out ${
          isToolbarVisible
            ? "max-h-12 translate-y-0 pb-1 pt-2 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-1 pb-0 pt-0 opacity-0"
        }`}
      >
        {isToolbarVisible && (
          <div className="flex items-center gap-2">
            <ComposerModeTabs mode={mode} onChange={setMode} />

            {/* Formatting toolbar */}
            {mode === "write" && (
              <FormattingToolbar
                textareaRef={textareaRef}
                onValueChange={(v) => {
                  setValue(v);
                  onValueChange?.(v);
                }}
                fileTrigger={
                  <button
                    type="button"
                    className={TOOLBAR_BTN}
                    onClick={handleAttachClick}
                    disabled={disabled}
                    aria-label={t("a11y.attachFile")}
                    title={t("a11y.attachFile")}
                  >
                    <Icon name="attach" size={16} />
                  </button>
                }
                callLinkTrigger={
                  onCreateCallLink != null ? (
                    <button
                      type="button"
                      className={TOOLBAR_BTN}
                      onClick={handleCreateCallLink}
                      disabled={disabled}
                      aria-label={t("call.createCallLink")}
                      title={t("call.createCallLink")}
                    >
                      <Icon name="phone" size={16} />
                    </button>
                  ) : undefined
                }
                scheduleTrigger={
                  <button
                    ref={scheduleButtonRef}
                    type="button"
                    className={TOOLBAR_BTN}
                    onClick={toggleScheduleMenu}
                    disabled={disabled || onSend == null}
                    aria-label={t("a11y.messageMenu")}
                    title={t("a11y.messageMenu")}
                  >
                    <Icon name="calendar" size={16} />
                  </button>
                }
                snippetsTrigger={
                  <button
                    ref={savedSnippetsButtonRef}
                    type="button"
                    className={TOOLBAR_BTN}
                    onClick={toggleSavedSnippetsMenu}
                    disabled={disabled}
                    aria-label={t("composer.savedSnippets")}
                    title={t("composer.savedSnippets")}
                  >
                    <Icon name="chat_bubble_outline" size={16} />
                  </button>
                }
                aiTrigger={
                  <AiComposerButton
                    onClick={() => {
                      setMediaPickerOpen(false);
                      setScheduleMenuOpen(false);
                      setSavedSnippetsMenuOpen(false);
                      setAiMenuOpen((o) => !o);
                    }}
                    active={aiMenuOpen}
                  />
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="relative p-3">
        {/* AI action menu */}
        {aiMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-dropdown"
              aria-hidden
              data-testid="composer-ai-menu-backdrop"
              onClick={() => setAiMenuOpen(false)}
            />
            <AiActionMenu
              draft={value}
              onInsert={(text) => {
                setValue(text);
                onValueChange?.(text);
              }}
              open={aiMenuOpen}
              onOpenChange={setAiMenuOpen}
              messagesContext={aiMessagesContext}
              chatContext={aiChatContext}
            />
          </>
        )}
        {scheduleMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-dropdown"
              aria-hidden
              onClick={() => setScheduleMenuOpen(false)}
            />
            <div
              className="fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated p-1 shadow-xl"
              style={scheduleMenuStyle}
              role="dialog"
              aria-label={t("a11y.messageMenu")}
            >
              {scheduleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-bg"
                  onClick={() => {
                    scheduleMessage(option.resolveSendAt(Date.now()));
                  }}
                >
                  <Icon name="calendar" size={14} className="text-text-muted" />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {savedSnippetsMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-dropdown"
              aria-hidden
              onClick={() => {
                setSavedSnippetsMenuOpen(false);
                setSavedSnippetCreateMode(false);
              }}
            />
            <div
              className="fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
              style={savedSnippetsMenuStyle}
              role="dialog"
              data-testid="composer-saved-snippets-picker"
              aria-label={t("composer.savedSnippets")}
            >
              {savedSnippetCreateMode ? (
                <>
                  <div className="border-b border-border-subtle px-3 py-2">
                    <p className="text-sm font-medium text-text-primary">
                      {t("composer.createNewSavedSnippet")}
                    </p>
                  </div>
                  <div className="space-y-2 px-3 py-3">
                    <label
                      htmlFor="saved-snippet-title-input"
                      className="block text-xs font-medium text-text-muted"
                    >
                      {t("composer.savedSnippetTitle")}
                    </label>
                    <input
                      id="saved-snippet-title-input"
                      value={savedSnippetTitle}
                      onChange={(event) => setSavedSnippetTitle(event.target.value)}
                      className="w-full rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft"
                      aria-label={t("composer.savedSnippetTitle")}
                      placeholder={t("composer.savedSnippetTitle")}
                    />
                    <label
                      htmlFor="saved-snippet-content-input"
                      className="block text-xs font-medium text-text-muted"
                    >
                      {t("composer.savedSnippetContent")}
                    </label>
                    <textarea
                      id="saved-snippet-content-input"
                      value={savedSnippetContent}
                      onChange={(event) => setSavedSnippetContent(event.target.value)}
                      rows={6}
                      className={`w-full resize-none rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft ${SCROLL_AREA_CLASS}`}
                      aria-label={t("composer.savedSnippetContent")}
                      placeholder={t("composer.savedSnippetContent")}
                    />
                  </div>
                  {savedSnippetsError != null && (
                    <p className="px-3 pb-2 text-xs text-notice-base">{savedSnippetsError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-3 py-2">
                    <button
                      type="button"
                      onClick={cancelCreateSavedSnippet}
                      className="rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:bg-bg hover:text-text-primary"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitCreateSavedSnippet()}
                      disabled={!canSaveSnippet}
                      className="rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-b border-border-subtle px-2 py-2">
                    <input
                      value={savedSnippetsFilter}
                      onChange={(event) => setSavedSnippetsFilter(event.target.value)}
                      className="w-full rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-soft"
                      aria-label={t("composer.filterSnippets")}
                      placeholder={t("composer.filter")}
                    />
                  </div>
                  {savedSnippetsError != null && (
                    <p className="px-2 pt-2 text-xs text-notice-base">{savedSnippetsError}</p>
                  )}
                  <div
                    className={`max-h-[250px] overflow-y-auto px-1 py-1 ${SCROLL_AREA_CLASS}`}
                    role="list"
                  >
                    {savedSnippetsLoading ? (
                      <p className="px-2 py-3 text-sm text-text-muted">
                        {t("composer.savedSnippetsLoading")}
                      </p>
                    ) : filteredSavedSnippets.length > 0 ? (
                      filteredSavedSnippets.map((snippet) => (
                        <SavedSnippetRow
                          key={snippet.id}
                          snippet={snippet}
                          onSelect={insertSavedSnippet}
                        />
                      ))
                    ) : (
                      <p className="px-2 py-3 text-sm text-text-muted">
                        {t("composer.savedSnippetsNoResults")}
                      </p>
                    )}
                  </div>
                  <div className="border-t border-border-subtle px-2 py-2">
                    <button
                      type="button"
                      onClick={startCreateSavedSnippet}
                      className="w-full rounded-md px-2.5 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg"
                    >
                      {t("composer.createNewSavedSnippet")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        <div className="flex min-h-10 items-stretch overflow-hidden rounded-2xl bg-bg px-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            accept="*/*"
          />

          <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center self-center">
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => toggleMediaPicker("emoji")}
              disabled={disabled}
              className={`hover:bg-bg-elevated/50 absolute inset-0 flex items-center justify-center rounded-l-xl transition-colors hover:text-text-primary disabled:opacity-50 ${
                mediaPickerOpen && mediaPickerTab === "emoji"
                  ? "text-text-primary"
                  : "text-composer-icon"
              }`}
              aria-label={t("a11y.emoji")}
            >
              <Icon name="mood" size={20} />
            </button>
          </div>

          {mediaPickerOpen && (
            <>
              <div
                className="fixed inset-0 z-dropdown"
                aria-hidden
                onClick={() => setMediaPickerOpen(false)}
              />
              <div
                className="fixed z-modal max-h-[min(400px,60vh)] overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
                style={mediaPickerStyle}
                role="dialog"
                data-testid="composer-media-picker"
                aria-label={mediaPickerTab === "emoji" ? t("a11y.emoji") : t("a11y.stickers")}
              >
                <div
                  className="flex items-center gap-1 border-b border-border-subtle bg-card-bg px-2 py-1.5"
                  role="tablist"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-label={t("a11y.emoji")}
                    aria-selected={mediaPickerTab === "emoji"}
                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      mediaPickerTab === "emoji"
                        ? "bg-bg text-text-primary"
                        : "text-text-muted hover:bg-bg hover:text-text-primary"
                    }`}
                    onClick={() => {
                      setMediaPickerTab("emoji");
                      updateMediaPickerPosition("emoji");
                    }}
                  >
                    <Icon name="mood" size={18} />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-label={t("a11y.stickers")}
                    aria-selected={mediaPickerTab === "sticker"}
                    className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      mediaPickerTab === "sticker"
                        ? "bg-bg text-text-primary"
                        : "text-text-muted hover:bg-bg hover:text-text-primary"
                    }`}
                    onClick={() => {
                      setMediaPickerTab("sticker");
                      updateMediaPickerPosition("sticker");
                    }}
                  >
                    <Icon name="smile" size={18} />
                  </button>
                </div>
                {mediaPickerTab === "emoji" ? (
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    className="composer-emoji-picker"
                    theme={
                      document.documentElement.dataset.theme === "light" ? Theme.LIGHT : Theme.DARK
                    }
                    width={Number(mediaPickerStyle.width ?? EMOJI_PICKER_WIDTH)}
                    height={MEDIA_PICKER_CONTENT_HEIGHT}
                    searchDisabled={false}
                    previewConfig={{ showPreview: false }}
                  />
                ) : (
                  <StickerPicker
                    embedded
                    onSelect={(sticker) => {
                      setValue((prev) => {
                        const next = prev + buildStickerMarkdown(sticker);
                        onValueChange?.(next);
                        return next;
                      });
                      setMediaPickerOpen(false);
                    }}
                    onClose={() => setMediaPickerOpen(false)}
                  />
                )}
              </div>
            </>
          )}

          <div className="relative min-w-0 flex-1">
            {mode === "write" ? (
              <>
                {showMentions && (
                  <div className="absolute bottom-full left-0 z-dropdown mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl">
                    {mentionSuggestions.length > 0 ? (
                      mentionSuggestions.map((user, index) => {
                        const presence = allUsers.get(user.userId)?.presence;
                        const statusLabel = formatUserStatusLabel(
                          allUsers.get(user.userId)?.status,
                        );
                        const presenceState =
                          presence != null
                            ? getPresenceState(presence.timestamp, presence.status)
                            : null;
                        return (
                          <button
                            type="button"
                            key={user.userId}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg ${
                              activeMentionIndex === index ? "bg-bg" : ""
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleMentionSelect(user);
                            }}
                            onMouseEnter={() => setActiveMentionIndex(index)}
                          >
                            <PresenceIndicator status={presenceState} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{user.fullName}</span>
                              {(statusLabel ?? user.email) && (
                                <span className="block truncate text-[11px] text-text-secondary">
                                  {statusLabel ?? user.email}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-sm text-text-muted">
                        {t("search.noResults")}
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={value}
                  onPaste={handlePaste}
                  onChange={(e) => {
                    setValue(e.target.value);
                    onValueChange?.(e.target.value);
                    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyDown={(e) => {
                    const normalizedKey = e.key.toLowerCase();
                    const isModPressed = e.metaKey || e.ctrlKey;
                    if (isModPressed && !e.altKey) {
                      if (normalizedKey === "b") {
                        e.preventDefault();
                        applyFormattingShortcut("**");
                        return;
                      }
                      if (normalizedKey === "i") {
                        e.preventDefault();
                        applyFormattingShortcut("*");
                        return;
                      }
                      if (normalizedKey === "e") {
                        e.preventDefault();
                        applyFormattingShortcut("`");
                        return;
                      }
                      if (normalizedKey === "x" && e.shiftKey) {
                        e.preventDefault();
                        applyFormattingShortcut("~~");
                        return;
                      }
                    }

                    if (
                      e.key === "ArrowUp" &&
                      !showMentions &&
                      value.length === 0 &&
                      !e.shiftKey &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      !e.altKey &&
                      onEditLastMessage != null
                    ) {
                      e.preventDefault();
                      onEditLastMessage();
                      return;
                    }

                    if (showMentions && mentionSuggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveMentionIndex((prev) =>
                          prev >= mentionSuggestions.length - 1 ? prev : prev + 1,
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveMentionIndex((prev) => (prev <= 0 ? 0 : prev - 1));
                        return;
                      }
                    }
                    if (showMentions && e.key === "Escape") {
                      e.preventDefault();
                      hideMentionDropdown();
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      if (showMentions && mentionSuggestions.length > 0) {
                        e.preventDefault();
                        const activeSuggestion = mentionSuggestions[activeMentionIndex];
                        if (activeSuggestion) {
                          handleMentionSelect(activeSuggestion);
                        }
                        return;
                      }
                      e.preventDefault();
                      if (showMentions) {
                        hideMentionDropdown();
                      }
                      void handleSend();
                    }
                  }}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  className={`max-h-32 min-h-10 w-full min-w-0 resize-none border-0 bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-composer-icon ${SCROLL_AREA_CLASS}`}
                />
              </>
            ) : (
              <div
                className={`max-h-32 min-h-10 w-full min-w-0 overflow-y-auto px-3 py-2 text-sm text-text-primary ${SCROLL_AREA_CLASS}`}
                role="region"
                aria-label={t("composer.preview")}
              >
                {outgoingBody.trim().length === 0 ? (
                  <p className="text-text-muted">{t("composer.previewEmpty")}</p>
                ) : previewLoading ? (
                  <p className="text-text-muted">{t("composer.previewLoading")}</p>
                ) : previewError ? (
                  <p className="text-notice-base">{previewError}</p>
                ) : (
                  <div
                    className="composer-preview-html message-body [&_pre]:bg-bg/50 break-words [&_a]:text-accent [&_a]:underline hover:[&_a]:opacity-90 [&_blockquote]:border-l-2 [&_blockquote]:border-border-subtle [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded [&_p:last-child]:mb-0 [&_p]:mb-1 [&_pre]:rounded [&_pre]:p-2 [&_pre]:text-sm"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(previewHtml, getRealmBaseUrl() || undefined),
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={disabled}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center gap-0 self-center rounded-r-xl rounded-l-xl bg-composer-send text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label={t("chat.sendPlaceholder")}
          >
            <Icon name="send" size={18} className="text-on-accent" />
          </button>
        </div>
      </div>
    </div>
  );
};
