import React, { useState, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { AiComposerButton } from "~/features/ai-reply/ai-reply.ui";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";
import { t } from "~/i18n/i18n";
import type { SavedSnippet } from "~/shared/api/zulip.types";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { useViewportKeyboard } from "~/shared/lib/touch";
import { isWebView } from "~/shared/lib/webview";
import { Icon } from "~/shared/ui/icon";
import { WidgetErrorBoundary } from "~/shared/ui/widget-error-boundary.ui";
import {
  MessageComposerAiActionMenuLayer,
  MessageComposerSmartReplyStrip,
} from "./message-composer-ai-surfaces.ui";
import {
  buildOutgoingMessageBody,
  resolveTomorrowMorningTimestamp,
} from "./message-composer-body.lib";
import {
  AI_UNAVAILABLE_POPOVER_HEIGHT,
  AI_UNAVAILABLE_POPOVER_WIDTH,
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  EMOJI_PICKER_HEIGHT,
  EMOJI_PICKER_WIDTH,
  SAVED_SNIPPETS_MENU_HEIGHT,
  SAVED_SNIPPETS_MENU_WIDTH,
  SCHEDULE_MENU_HEIGHT,
  SCHEDULE_MENU_WIDTH,
  SCHEDULE_RETRY_DELAY_MS,
  STICKER_PICKER_HEIGHT,
  STICKER_PICKER_WIDTH,
} from "./message-composer-constants.lib";
import { useComposerDraft } from "./message-composer-draft.hook";
import { getFloatingPickerStyle } from "./message-composer-floating.lib";
import { resolveComposerKeyboardInsetPx } from "./message-composer-keyboard-inset.lib";
import { MessageComposerMediaPickerPopover } from "./message-composer-media-picker-popover.ui";
import { useComposerMentions } from "./message-composer-mentions.hook";
import { ComposerModeTabs } from "./message-composer-mode-tabs.ui";
import { MessageComposerPreface } from "./message-composer-preface.ui";
import { MessageComposerPreviewBody } from "./message-composer-preview-body.ui";
import { useMessageComposerPreview } from "./message-composer-preview.hook";
import { MessageComposerSavedSnippetsDialog } from "./message-composer-saved-snippets-dialog.ui";
import { useComposerSavedSnippetsStore } from "./message-composer-saved-snippets.model";
import { MessageComposerSchedulePopover } from "./message-composer-schedule-popover.ui";
import { wrapSelection } from "./message-composer-selection.lib";
import { TOOLBAR_BTN } from "./message-composer-styles.lib";
import { FormattingToolbar } from "./message-composer-toolbar.ui";
import { useMessageComposerUpload } from "./message-composer-upload.hook";
import { MessageComposerWriteBody } from "./message-composer-write-body.ui";
import type { ComposerSendNewlineMode } from "./message-composer-input-commands.lib";
import type { ScheduleMenuOption } from "./message-composer-schedule-popover.types";
import type {
  ComposerMode,
  MediaPickerTab,
  MessageComposerProps,
  ScheduledComposerMessage,
} from "./message-composer.types";
import type { EmojiClickData } from "emoji-picker-react";

export type { ReplyQuote } from "./message-composer.types";

// TODO: Re-enable after scheduled send uses Zulip's server API and persists the target chat.
const ENABLE_SCHEDULED_SEND_UI = false;

export const MessageComposerInner: React.FC<MessageComposerProps> = ({
  onSend,
  onSubmitEdit,
  onCancelEdit,
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
  editSession,
  aiMessagesContext,
  aiChatContext,
}) => {
  const sendNewlineMode: ComposerSendNewlineMode = "enter-sends";
  const [mode, setMode] = useState<ComposerMode>("write");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("emoji");
  const [mediaPickerStyle, setMediaPickerStyle] = useState<React.CSSProperties>({});
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false);
  const [scheduleMenuStyle, setScheduleMenuStyle] = useState<React.CSSProperties>({});
  const [savedSnippetsMenuOpen, setSavedSnippetsMenuOpen] = useState(false);
  const [savedSnippetsMenuStyle, setSavedSnippetsMenuStyle] = useState<React.CSSProperties>({});
  const [aiMenuStyle, setAiMenuStyle] = useState<React.CSSProperties>({});
  const [savedSnippetsFilter, setSavedSnippetsFilter] = useState("");
  const [savedSnippetCreateMode, setSavedSnippetCreateMode] = useState(false);
  const [savedSnippetTitle, setSavedSnippetTitle] = useState("");
  const [savedSnippetContent, setSavedSnippetContent] = useState("");
  const [savedSnippetSaving, setSavedSnippetSaving] = useState(false);
  const savedSnippets = useComposerSavedSnippetsStore((s) => s.snippets);
  const savedSnippetsLoading = useComposerSavedSnippetsStore((s) => s.loadingInitial);
  const savedSnippetsErrorCode = useComposerSavedSnippetsStore((s) => s.error);
  const openSavedSnippets = useComposerSavedSnippetsStore((s) => s.openSavedSnippets);
  const createSavedSnippetAndSync = useComposerSavedSnippetsStore(
    (s) => s.createSavedSnippetAndSync,
  );
  const clearSavedSnippetsError = useComposerSavedSnippetsStore((s) => s.clearSavedSnippetsError);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledComposerMessage[]>([]);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState(() => getCachedRealmEmojis());
  const { value, setValue, isEditing } = useComposerDraft({
    initialValue,
    editSession,
    onValueChange,
    setAiMenuOpen,
    setScheduleMenuOpen,
    setSavedSnippetsMenuOpen,
    setMediaPickerOpen,
    setMode,
  });
  const {
    mentionSuggestions,
    showMentions,
    setMentionQuery,
    showMentionDropdown,
    hideMentionDropdown,
    activeMentionIndex,
    setActiveMentionIndex,
    mentionStartPos,
    setMentionStartPos,
  } = useComposerMentions();
  const effectiveReplyQuote = isEditing ? null : replyQuote;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevDisabledRef = useRef(disabled);
  useLayoutEffect(() => {
    if (prevDisabledRef.current && !disabled && mode === "write") {
      textareaRef.current?.focus();
    }
    prevDisabledRef.current = disabled;
  }, [disabled, mode]);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const savedSnippetsButtonRef = useRef<HTMLButtonElement>(null);
  const aiButtonAnchorRef = useRef<HTMLSpanElement>(null);
  const scheduledSendInFlightRef = useRef<symbol | null>(null);
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

  const {
    files,
    setFiles,
    filePreviewUrls,
    isDragOver,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    beginFileSelectionSession,
    onFileInputChange: handleFileChangeFromHook,
    removeFileByIndex: removeFile,
    uploadProgressPercent,
    isUploadInProgress,
  } = useMessageComposerUpload({ disabled: disabled || isEditing, uploadProgress });
  const [isComposerFocusWithin, setIsComposerFocusWithin] = useState(false);
  const outgoingBody = useMemo(
    () => buildOutgoingMessageBody(value, effectiveReplyQuote),
    [value, effectiveReplyQuote],
  );
  const preview = useMessageComposerPreview({ mode, outgoingBody });
  const scheduleOptions = useMemo<ScheduleMenuOption[]>(
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
  const savedSnippetsError = useMemo(() => {
    if (savedSnippetsErrorCode === "load_failed") {
      return t("composer.savedSnippetsLoadError");
    }
    if (savedSnippetsErrorCode === "create_failed") {
      return t("composer.savedSnippetsCreateError");
    }
    return null;
  }, [savedSnippetsErrorCode]);
  const ensureCustomEmojisLoaded = useCallback(() => {
    void ensureRealmEmojisLoaded()
      .then((list) => {
        setCustomEmojis(list);
      })
      .catch(() => {
        // Custom emoji load failure is non-fatal; picker still uses Unicode.
      });
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applyFormattingShortcut = useCallback(
    (marker: string) => {
      wrapSelection(textareaRef, marker, (nextValue) => {
        setValue(nextValue);
      });
    },
    [setValue],
  );

  void filePreviewUrls;

  const previewHtml = preview.html;
  const previewLoading = preview.loading;
  const previewError = preview.error;

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const before = text.slice(0, cursorPos);
      const match = /(?:^|[\s([{,.:;!?])@(\S*)$/.exec(before);
      if (match) {
        const query = match[1] ?? "";
        setMentionQuery(query);
        setMentionStartPos(cursorPos - query.length - 1);
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
      hideMentionDropdown();
      setActiveMentionIndex(0);
      const newCursorPos = before.length + mention.length;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [value, mentionStartPos, hideMentionDropdown, setValue],
  );

  const clearComposerInput = useCallback(() => {
    if (effectiveReplyQuote) {
      onClearReply?.();
    }
    setValue("");
    setFiles([]);
  }, [onClearReply, effectiveReplyQuote, setFiles, setValue]);

  const scheduleMessage = useCallback(
    (sendAt: number) => {
      const hasText = value.trim().length > 0;
      const hasFiles = files.length > 0;
      if ((!hasText && !hasFiles) || disabled || onSend == null) return;

      const subject = activeTopic ?? "";
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
    if (disabled || scheduledSendInFlightRef.current != null || onSend == null) return;

    const now = Date.now();
    const dueMessage = [...scheduledMessages]
      .filter((message) => message.sendAt <= now)
      .sort((left, right) => left.sendAt - right.sendAt)[0];

    if (dueMessage == null) return;

    const sendToken = Symbol("scheduled-send");
    scheduledSendInFlightRef.current = sendToken;
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
      if (scheduledSendInFlightRef.current === sendToken) {
        scheduledSendInFlightRef.current = null;
      }
    }
  }, [disabled, onSend, scheduledMessages]);

  const handleSend = async () => {
    if (isEditing) {
      if (disabled || editSession == null || onSubmitEdit == null) return;
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      try {
        await onSubmitEdit(editSession.messageId, trimmed);
      } catch {
        return;
      }
      return;
    }

    const hasText = value.trim().length > 0;
    const hasFiles = files.length > 0;
    if ((!hasText && !hasFiles) || disabled) return;
    const subject = activeTopic ?? "";
    const bodyToSend = outgoingBody;
    const filesToSend = hasFiles ? [...files] : undefined;
    setValue("");
    setFiles([]);

    // Restore focus/caret after optimistic clear so typing can continue before network.
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || disabled || mode !== "write") {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    });

    try {
      await onSend?.(bodyToSend, subject, filesToSend);
    } catch {
      return;
    }
    if (effectiveReplyQuote) {
      onClearReply?.();
    }
    setAiMenuOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setMediaPickerOpen(false);
  };

  const handleEmojiClick = (data: EmojiClickData) => {
    const customEmojiName = data.names?.[0]?.trim() ?? "";
    let emoji = data.emoji ?? "";
    if (data.isCustom) {
      emoji = customEmojiName ? `:${customEmojiName}:` : "";
    }
    if (emoji.length === 0) return;
    setValue((prev) => prev + emoji);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const cursorPosition = textarea.value.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (isEditing) return;
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
    },
    [isEditing, setFiles],
  );

  const handleAttachClick = () => {
    if (disabled || isEditing) return;
    const fileInput = fileInputRef.current;
    if (fileInput == null) return;
    beginFileSelectionSession();
    fileInput.value = "";
    if (typeof fileInput.showPicker === "function") {
      try {
        fileInput.showPicker();
        return;
      } catch {
        // Fallback to click for environments where showPicker throws.
      }
    }
    fileInput.click();
  };

  const handleFileInputEvent = useCallback(
    (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
      handleFileChangeFromHook(event as React.ChangeEvent<HTMLInputElement>);
    },
    [handleFileChangeFromHook],
  );

  const handleCreateCallLink = useCallback(() => {
    if (disabled || isEditing || onCreateCallLink == null) {
      return;
    }
    const callLink = onCreateCallLink()?.trim();
    if (callLink == null || callLink.length === 0) {
      return;
    }

    setValue((prev) => {
      const needsLineBreak = prev.length > 0 && !prev.endsWith("\n");
      return needsLineBreak ? `${prev}\n${callLink}` : `${prev}${callLink}`;
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
  }, [disabled, isEditing, onCreateCallLink, setValue]);

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
      if (tab === "emoji") {
        ensureCustomEmojisLoaded();
      }
      updateMediaPickerPosition(tab);
    },
    [ensureCustomEmojisLoaded, mediaPickerOpen, mediaPickerTab, updateMediaPickerPosition],
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
        setValue((prev) => prev + content);
        setSavedSnippetsMenuOpen(false);
        return;
      }

      const selectionStart = textarea.selectionStart ?? value.length;
      const selectionEnd = textarea.selectionEnd ?? value.length;
      const nextValue = value.slice(0, selectionStart) + content + value.slice(selectionEnd);
      setValue(nextValue);
      setSavedSnippetsMenuOpen(false);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = selectionStart + content.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [setValue, value],
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

  const updateAiMenuPosition = useCallback(() => {
    setAiMenuStyle(
      getFloatingPickerStyle(
        aiButtonAnchorRef.current,
        AI_UNAVAILABLE_POPOVER_WIDTH,
        AI_UNAVAILABLE_POPOVER_HEIGHT,
      ),
    );
  }, []);

  React.useEffect(() => {
    if (!aiMenuOpen) return;
    updateAiMenuPosition();
    const handleWindowChange = () => updateAiMenuPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [aiMenuOpen, updateAiMenuPosition]);

  const toggleAiUnavailablePopover = useCallback(() => {
    setMediaPickerOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setAiMenuOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        updateAiMenuPosition();
      }
      return nextOpen;
    });
  }, [updateAiMenuPosition]);

  const toggleSavedSnippetsMenu = useCallback(() => {
    setSavedSnippetsMenuOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        setAiMenuOpen(false);
        setMediaPickerOpen(false);
        setScheduleMenuOpen(false);
        setSavedSnippetCreateMode(false);
        setSavedSnippetsFilter("");
        clearSavedSnippetsError();
        void openSavedSnippets();
        updateSavedSnippetsMenuPosition();
      }
      return nextOpen;
    });
  }, [clearSavedSnippetsError, openSavedSnippets, updateSavedSnippetsMenuPosition]);

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
    clearSavedSnippetsError();
    try {
      await createSavedSnippetAndSync({
        title: savedSnippetTitle.trim(),
        content: savedSnippetContent.trim(),
      });
      setSavedSnippetCreateMode(false);
      setSavedSnippetTitle("");
      setSavedSnippetContent("");
      setSavedSnippetsFilter("");
    } finally {
      setSavedSnippetSaving(false);
    }
  }, [
    canSaveSnippet,
    clearSavedSnippetsError,
    createSavedSnippetAndSync,
    savedSnippetContent,
    savedSnippetTitle,
  ]);

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
      className={`flex-shrink-0 rounded-xl border-t border-border-subtle bg-composer-outer ${isDragOver ? "ring-2 ring-inset ring-accent" : ""}`}
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
      <MessageComposerPreface
        uploadProgress={uploadProgress}
        uploadProgressPercent={uploadProgressPercent}
        files={files}
        filePreviewUrls={filePreviewUrls}
        isUploadInProgress={isUploadInProgress}
        onCancelUpload={onCancelUpload}
        removeFile={removeFile}
        scheduledMessages={scheduledMessages}
        onCancelScheduled={cancelScheduledMessage}
        replyQuote={effectiveReplyQuote}
        onClearReply={onClearReply}
        isEditing={isEditing}
        onCancelEdit={onCancelEdit}
      />

      {!isEditing && <MessageComposerSmartReplyStrip onAccept={setValue} />}

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
                onValueChange={setValue}
                fileTrigger={
                  !isEditing ? (
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
                  ) : undefined
                }
                callLinkTrigger={
                  !isEditing && onCreateCallLink != null ? (
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
                  !isEditing && ENABLE_SCHEDULED_SEND_UI ? (
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
                  ) : undefined
                }
                snippetsTrigger={
                  !isEditing ? (
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
                  ) : undefined
                }
                aiTrigger={
                  !isEditing ? (
                    <span ref={aiButtonAnchorRef}>
                      <AiComposerButton onClick={toggleAiUnavailablePopover} active={aiMenuOpen} />
                    </span>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="relative p-3">
        {!isEditing && (
          <MessageComposerAiActionMenuLayer
            open={aiMenuOpen}
            draft={value}
            onInsert={setValue}
            onOpenChange={setAiMenuOpen}
            messagesContext={aiMessagesContext ?? []}
            chatContext={aiChatContext}
            popoverStyle={aiMenuStyle}
          />
        )}
        {!isEditing && scheduleMenuOpen && (
          <MessageComposerSchedulePopover
            scheduleMenuStyle={scheduleMenuStyle}
            options={scheduleOptions}
            onPick={(sendAt) => {
              scheduleMessage(sendAt);
            }}
            onCloseBackdrop={() => setScheduleMenuOpen(false)}
          />
        )}
        {!isEditing && savedSnippetsMenuOpen && (
          <MessageComposerSavedSnippetsDialog
            dialogStyle={savedSnippetsMenuStyle}
            createMode={savedSnippetCreateMode}
            savedSnippetTitle={savedSnippetTitle}
            savedSnippetContent={savedSnippetContent}
            savedSnippetsFilter={savedSnippetsFilter}
            savedSnippetsLoading={savedSnippetsLoading}
            savedSnippetsError={savedSnippetsError}
            filteredSnippets={filteredSavedSnippets}
            canSaveSnippet={canSaveSnippet}
            onCloseBackdrop={() => {
              setSavedSnippetsMenuOpen(false);
              setSavedSnippetCreateMode(false);
            }}
            onTitleChange={setSavedSnippetTitle}
            onContentChange={setSavedSnippetContent}
            onFilterChange={setSavedSnippetsFilter}
            onCancelCreate={cancelCreateSavedSnippet}
            onSubmitCreate={submitCreateSavedSnippet}
            onSelectSnippet={insertSavedSnippet}
            onStartCreate={startCreateSavedSnippet}
          />
        )}
        <div className="flex items-center gap-1">
          <div className="flex min-h-10 min-w-0 flex-1 items-stretch overflow-visible rounded-2xl bg-bg px-1.5 outline-none transition-[outline-color] focus-within:outline-1 focus-within:outline-offset-0 focus-within:outline-accent-soft">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileInputEvent}
              onInput={handleFileInputEvent}
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
              <MessageComposerMediaPickerPopover
                mediaPickerStyle={mediaPickerStyle}
                mediaPickerTab={mediaPickerTab}
                onClose={() => setMediaPickerOpen(false)}
                onTabChange={(tab) => {
                  setMediaPickerTab(tab);
                  if (tab === "emoji") {
                    ensureCustomEmojisLoaded();
                  }
                  updateMediaPickerPosition(tab);
                }}
                onEmojiClick={handleEmojiClick}
                customEmojis={customEmojis}
                onStickerSelect={(markdown) => {
                  setValue((prev) => prev + markdown);
                  setMediaPickerOpen(false);
                }}
              />
            )}

            <div className="relative min-w-0 flex-1">
              {mode === "write" ? (
                <MessageComposerWriteBody
                  value={value}
                  placeholder={placeholder}
                  disabled={disabled}
                  textareaRef={textareaRef}
                  showMentions={showMentions}
                  mentionSuggestions={mentionSuggestions}
                  activeMentionIndex={activeMentionIndex}
                  onActiveMentionIndexChange={setActiveMentionIndex}
                  onMentionSelect={handleMentionSelect}
                  onHideMentionDropdown={hideMentionDropdown}
                  onValueChange={setValue}
                  onDetectMention={detectMention}
                  applyFormattingShortcut={applyFormattingShortcut}
                  onPaste={handlePaste}
                  onSend={handleSend}
                  sendNewlineMode={sendNewlineMode}
                  onEditLastMessage={onEditLastMessage}
                  isEditing={isEditing}
                  onCancelEdit={onCancelEdit}
                />
              ) : (
                <MessageComposerPreviewBody
                  outgoingBodyTrim={outgoingBody.trim()}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  previewHtml={previewHtml}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={disabled || (isEditing && value.trim().length === 0)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center gap-0 self-center rounded-l-xl rounded-r-xl bg-composer-send text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label={isEditing ? t("common.save") : t("chat.sendPlaceholder")}
          >
            <Icon name="send" size={18} className="text-on-accent" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const MessageComposer: React.FC<MessageComposerProps> = (props) => (
  <WidgetErrorBoundary sectionLabel={t("chat.sendPlaceholder")}>
    <MessageComposerInner {...props} />
  </WidgetErrorBoundary>
);
