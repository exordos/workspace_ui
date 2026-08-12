import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
  useEffect,
  useId,
} from "react";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { AiComposerButton } from "~/features/ai-reply/ai-reply.ui";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";
import { t } from "~/i18n/i18n";
import AlternateEmailSvg from "~/shared/assets/icons/composer-alternate-email.svg?react";
import ChatSvg from "~/shared/assets/icons/composer-chat.svg?react";
import ScheduleSvg from "~/shared/assets/icons/composer-schedule.svg?react";
import { useViewportKeyboard } from "~/shared/lib/touch";
import { isWebView } from "~/shared/lib/webview";
import { WidgetErrorBoundary } from "~/shared/ui/widget-error-boundary.ui";
import {
  MessageComposerAiActionMenuLayer,
  MessageComposerSmartReplyStrip,
} from "./message-composer-ai-surfaces.ui";
import {
  buildOutgoingMessageBody,
  insertWorkspaceMention,
  prepareAttachmentFiles,
  resolveTomorrowMorningTimestamp,
} from "./message-composer-body.lib";
import {
  AI_UNAVAILABLE_POPOVER_HEIGHT,
  AI_UNAVAILABLE_POPOVER_WIDTH,
  COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
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
import {
  MessageComposerAttachIcon,
  MessageComposerBottomPanelCloseIcon,
  MessageComposerBottomPanelOpenIcon,
  MessageComposerEmojiIcon,
  MessageComposerSendIcon,
} from "./message-composer-icons.ui";
import { resolveComposerKeyboardInsetPx } from "./message-composer-keyboard-inset.lib";
import { MessageComposerMediaPickerPopover } from "./message-composer-media-picker-popover.ui";
import { useComposerMentions } from "./message-composer-mentions.hook";
import { ComposerModeTabs } from "./message-composer-mode-tabs.ui";
import { MessageComposerEditNotice, MessageComposerPreface } from "./message-composer-preface.ui";
import { MessageComposerPreviewBody } from "./message-composer-preview-body.ui";
import { useMessageComposerPreview } from "./message-composer-preview.hook";
import {
  getWorkspaceComposerReferenceSuggestions,
  insertWorkspaceComposerReference,
  replaceWorkspaceComposerLinks,
  type WorkspaceComposerReference,
} from "./message-composer-reference.lib";
import { useMessageComposerResize } from "./message-composer-resize.hook";
import {
  MessageComposerHeightButton,
  MessageComposerResizeHandle,
} from "./message-composer-resize.ui";
import { MessageComposerSavedSnippetsDialog } from "./message-composer-saved-snippets-dialog.ui";
import { useComposerSavedSnippetsStore } from "./message-composer-saved-snippets.model";
import { MessageComposerSchedulePopover } from "./message-composer-schedule-popover.ui";
import { buildScheduledComposerMessage } from "./message-composer-schedule.lib";
import { wrapSelection } from "./message-composer-selection.lib";
import { TOOLBAR_BTN } from "./message-composer-styles.lib";
import { FormattingToolbar } from "./message-composer-toolbar.ui";
import { useMessageComposerUpload } from "./message-composer-upload.hook";
import { MessageComposerWriteBody } from "./message-composer-write-body.ui";
import type { WorkspaceComposerMention } from "./message-composer-body.lib";
import type { ComposerSendNewlineMode } from "./message-composer-input-commands.lib";
import type { ComposerSuggestion } from "./message-composer-mention-dropdown.types";
import type { SavedSnippet } from "./message-composer-saved-snippets.types";
import type { ScheduleMenuOption } from "./message-composer-schedule-popover.types";
import type {
  MessageComposerActionCapability,
  ComposerMode,
  MediaPickerTab,
  MessageComposerProps,
  MessageComposerSendResult,
  ScheduledComposerMessage,
} from "./message-composer.types";
import type { EmojiClickData } from "emoji-picker-react";

export type { ReplyQuote } from "./message-composer.types";

// TODO: Re-enable after scheduled send uses a backend API and persists the target chat.
const ENABLE_SCHEDULED_SEND_UI = false;

const DEFAULT_ACTION_CAPABILITY: MessageComposerActionCapability = { mode: "enabled" };

function resolveActionCapability(
  capability: MessageComposerActionCapability | undefined,
): MessageComposerActionCapability {
  return capability ?? DEFAULT_ACTION_CAPABILITY;
}

function isActionSupported(capability: MessageComposerActionCapability): boolean {
  return capability.mode === "enabled";
}

function resolveToolbarActionLabel(
  supported: boolean,
  capability: MessageComposerActionCapability,
  supportedLabel: string,
): string {
  return supported
    ? supportedLabel
    : (capability.unsupportedText ?? t("composer.actionUnsupported"));
}

interface MessageComposerToolbarRowProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  mode: ComposerMode;
  onModeChange: (nextMode: ComposerMode) => void;
  showPreviewTab: boolean;
  isEditing: boolean;
  disabled: boolean;
  uploadSupported: boolean;
  uploadCapability: MessageComposerActionCapability;
  scheduledSendSupported: boolean;
  scheduledSendCapability: MessageComposerActionCapability;
  savedSnippetsSupported: boolean;
  onCreateCallLink: (() => string | null | undefined) | undefined;
  onAttachClick: () => void;
  onCreateCallLinkClick: () => void;
  onToggleScheduleMenu: () => void;
  onToggleSavedSnippetsMenu: () => void;
  onToggleAiUnavailablePopover: () => void;
  onToggleMediaPicker: () => void;
  onValueChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  scheduleButtonRef: React.RefObject<HTMLButtonElement | null>;
  savedSnippetsButtonRef: React.RefObject<HTMLButtonElement | null>;
  aiButtonAnchorRef: React.RefObject<HTMLSpanElement | null>;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  aiMenuOpen: boolean;
  emojiPickerOpen: boolean;
}

interface MessageComposerCompactLeadingControlsProps {
  onExpandedChange: (expanded: boolean) => void;
}

const MessageComposerCompactLeadingControls =
  React.memo<MessageComposerCompactLeadingControlsProps>(
    function MessageComposerCompactLeadingControls({ onExpandedChange }) {
      return (
        <div
          data-testid="composer-compact-controls"
          className="mb-1 flex flex-shrink-0 items-center self-end"
        >
          <button
            type="button"
            className={`${TOOLBAR_BTN} text-composer-icon`}
            onClick={() => onExpandedChange(true)}
            aria-label={t("composer.expandToolbar")}
            title={t("composer.expandToolbar")}
            aria-expanded="false"
          >
            <MessageComposerBottomPanelCloseIcon />
          </button>
        </div>
      );
    },
  );

interface MessageComposerCompactTrailingControlsProps {
  isEditing: boolean;
  disabled: boolean;
  uploadSupported: boolean;
  uploadCapability: MessageComposerActionCapability;
  onAttachClick: () => void;
  onToggleMediaPicker: () => void;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  emojiPickerOpen: boolean;
}

const MessageComposerCompactTrailingControls =
  React.memo<MessageComposerCompactTrailingControlsProps>(
    function MessageComposerCompactTrailingControls({
      isEditing,
      disabled,
      uploadSupported,
      uploadCapability,
      onAttachClick,
      onToggleMediaPicker,
      emojiButtonRef,
      emojiPickerOpen,
    }) {
      const attachLabel = resolveToolbarActionLabel(
        uploadSupported,
        uploadCapability,
        t("a11y.attachFile"),
      );

      return (
        <div
          data-testid="composer-compact-trailing-controls"
          className="mb-1 flex flex-shrink-0 items-center gap-2 self-end"
        >
          {!isEditing ? (
            <button
              type="button"
              className={`${TOOLBAR_BTN} text-composer-icon`}
              onClick={onAttachClick}
              disabled={disabled}
              aria-label={attachLabel}
              title={attachLabel}
            >
              <MessageComposerAttachIcon compact />
            </button>
          ) : null}
          <button
            ref={emojiButtonRef}
            type="button"
            className={`${TOOLBAR_BTN} flex-shrink-0 ${
              emojiPickerOpen ? "text-icon-active" : "text-composer-icon"
            }`}
            onClick={onToggleMediaPicker}
            disabled={disabled}
            aria-label={t("a11y.emoji")}
            title={t("a11y.emoji")}
            aria-pressed={emojiPickerOpen}
          >
            <MessageComposerEmojiIcon />
          </button>
        </div>
      );
    },
  );

const MessageComposerToolbarRow = React.memo<MessageComposerToolbarRowProps>(
  function MessageComposerToolbarRow({
    expanded,
    onExpandedChange,
    mode,
    onModeChange,
    showPreviewTab,
    isEditing,
    disabled,
    uploadSupported,
    uploadCapability,
    scheduledSendSupported,
    scheduledSendCapability,
    savedSnippetsSupported,
    onCreateCallLink,
    onAttachClick,
    onCreateCallLinkClick,
    onToggleScheduleMenu,
    onToggleSavedSnippetsMenu,
    onToggleAiUnavailablePopover,
    onToggleMediaPicker,
    onValueChange,
    textareaRef,
    scheduleButtonRef,
    savedSnippetsButtonRef,
    aiButtonAnchorRef,
    emojiButtonRef,
    aiMenuOpen,
    emojiPickerOpen,
  }) {
    const attachLabel = resolveToolbarActionLabel(
      uploadSupported,
      uploadCapability,
      t("a11y.attachFile"),
    );
    const scheduleLabel = resolveToolbarActionLabel(
      scheduledSendSupported,
      scheduledSendCapability,
      t("a11y.messageMenu"),
    );
    const fileTrigger = !isEditing ? (
      <button
        type="button"
        className={TOOLBAR_BTN}
        onClick={onAttachClick}
        disabled={disabled}
        aria-label={attachLabel}
        title={attachLabel}
      >
        <MessageComposerAttachIcon />
      </button>
    ) : undefined;
    const callLinkTrigger =
      !isEditing && onCreateCallLink != null ? (
        <button
          type="button"
          className={TOOLBAR_BTN}
          onClick={onCreateCallLinkClick}
          disabled={disabled}
          aria-label={t("call.createCallLink")}
          title={t("call.createCallLink")}
        >
          <AlternateEmailSvg
            width={24}
            height={24}
            data-composer-icon="alternate-email"
            aria-hidden
          />
        </button>
      ) : undefined;
    const scheduleTrigger =
      !isEditing && ENABLE_SCHEDULED_SEND_UI ? (
        <button
          ref={scheduleButtonRef}
          type="button"
          className={TOOLBAR_BTN}
          onClick={onToggleScheduleMenu}
          disabled={disabled}
          aria-label={scheduleLabel}
          title={scheduleLabel}
        >
          <ScheduleSvg width={24} height={24} data-composer-icon="schedule" aria-hidden />
        </button>
      ) : undefined;
    const snippetsTrigger =
      !isEditing && savedSnippetsSupported ? (
        <button
          ref={savedSnippetsButtonRef}
          type="button"
          className={TOOLBAR_BTN}
          onClick={onToggleSavedSnippetsMenu}
          disabled={disabled}
          aria-label={t("composer.savedSnippets")}
          title={t("composer.savedSnippets")}
        >
          <ChatSvg width={24} height={21.412} data-composer-icon="chat" aria-hidden />
        </button>
      ) : undefined;
    const aiTrigger = !isEditing ? (
      <span ref={aiButtonAnchorRef}>
        <AiComposerButton onClick={onToggleAiUnavailablePopover} active={aiMenuOpen} />
      </span>
    ) : undefined;

    const emojiTrigger = (
      <button
        ref={emojiButtonRef}
        type="button"
        className={`${TOOLBAR_BTN} ${emojiPickerOpen ? "text-icon-active" : "text-composer-icon"}`}
        onClick={onToggleMediaPicker}
        disabled={disabled}
        aria-label={t("a11y.emoji")}
        title={t("a11y.emoji")}
        aria-pressed={emojiPickerOpen}
      >
        <MessageComposerEmojiIcon />
      </button>
    );

    const toolbarToggle = (
      <button
        type="button"
        className={`${TOOLBAR_BTN} text-composer-icon disabled:opacity-40`}
        onClick={() => onExpandedChange(!expanded)}
        disabled={mode === "preview"}
        aria-label={expanded ? t("composer.collapseToolbar") : t("composer.expandToolbar")}
        title={expanded ? t("composer.collapseToolbar") : t("composer.expandToolbar")}
        aria-expanded={expanded}
      >
        <MessageComposerBottomPanelOpenIcon />
      </button>
    );

    if (!expanded) return null;

    return (
      <div data-testid="composer-toolbar-row" className="h-10 flex-shrink-0 overflow-x-auto pb-2">
        <div className="flex w-max min-w-full items-center gap-3 pl-5">
          {toolbarToggle}
          <ComposerModeTabs mode={mode} onChange={onModeChange} showPreviewTab={showPreviewTab} />

          {mode === "write" && (
            <FormattingToolbar
              textareaRef={textareaRef}
              onValueChange={onValueChange}
              fileTrigger={fileTrigger}
              emojiTrigger={emojiTrigger}
              callLinkTrigger={callLinkTrigger}
              scheduleTrigger={scheduleTrigger}
              snippetsTrigger={snippetsTrigger}
              aiTrigger={aiTrigger}
            />
          )}
        </div>
      </div>
    );
  },
);

export const MessageComposerInner: React.FC<MessageComposerProps> = ({
  onSend,
  optimisticClearOnSend = false,
  attachments,
  attachmentsBlockSend = false,
  onAddAttachments,
  onRemoveAttachment,
  onRetryAttachment,
  onSubmitEdit,
  onCancelEdit,
  onCreateCallLink,
  onCancelUpload,
  disabled = false,
  joinedTop = false,
  uploadProgress,
  placeholder = t("chat.sendPlaceholder"),
  activeTopic,
  replyQuote,
  onClearReply,
  leadingContent,
  outgoingBodyOverride,
  allowEmptyActiveValueSend = false,
  focusKey,
  initialValue,
  draftSessionKey,
  onValueChange,
  onEditLastMessage,
  editSession,
  capabilities,
  resolveMention,
  onLoadWorkspaceFilePreview,
  aiMessagesContext,
  aiChatContext,
}) => {
  // Capabilities preserve the composer layout while deciding whether an action can hit the backend.
  const sendNewlineMode: ComposerSendNewlineMode = "enter-sends";
  const [mode, setMode] = useState<ComposerMode>("write");
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [textareaContentHeight, setTextareaContentHeight] = useState(
    COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  );
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
  const [sendInFlight, setSendInFlight] = useState(false);
  const [unsupportedActionText, setUnsupportedActionText] = useState<string | null>(null);
  const [aiMenuNotificationText, setAiMenuNotificationText] = useState<string | null>(null);
  const uploadCapability = resolveActionCapability(capabilities?.upload);
  const savedSnippetsCapability = resolveActionCapability(capabilities?.savedSnippets);
  const previewCapability = resolveActionCapability(capabilities?.preview);
  const mentionsCapability = resolveActionCapability(capabilities?.mentions);
  const scheduledSendCapability = resolveActionCapability(capabilities?.scheduledSend);
  const uploadSupported = isActionSupported(uploadCapability);
  const controlledAttachmentsEnabled = attachments != null && onAddAttachments != null;
  const controlledAttachmentFileNames = useMemo(
    () => attachments?.map((attachment) => attachment.fileName) ?? [],
    [attachments],
  );
  const savedSnippetsSupported = isActionSupported(savedSnippetsCapability);
  const previewSupported = isActionSupported(previewCapability);
  const mentionsSupported = isActionSupported(mentionsCapability);
  const scheduledSendSupported = isActionSupported(scheduledSendCapability);
  // Saved snippets are intentionally local-only until Workspace exposes this contract.
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
  const { value, setValue, isEditing } = useComposerDraft({
    initialValue,
    draftSessionKey,
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
    mentionUsers,
  } = useComposerMentions({ enabled: mentionsSupported });
  const workspaceComposerMentions = useMemo<WorkspaceComposerMention[]>(() => {
    const displayNameCounts = new Map<string, number>();
    for (const user of mentionUsers) {
      displayNameCounts.set(user.displayName, (displayNameCounts.get(user.displayName) ?? 0) + 1);
    }
    return mentionUsers.map((user) => ({
      userUuid: user.userUuid,
      displayName: user.displayName,
      visibleText:
        (displayNameCounts.get(user.displayName) ?? 0) > 1
          ? `${user.displayName} (${user.username})`
          : user.displayName,
    }));
  }, [mentionUsers]);
  const workspaceComposerMentionsByUserUuid = useMemo(
    () => new Map(workspaceComposerMentions.map((mention) => [mention.userUuid, mention] as const)),
    [workspaceComposerMentions],
  );
  const messengerOwnerKey = useMessengerStore((state) => state.ownerKey);
  const workspaceReferencesEnabled =
    capabilities?.mentions?.mode === "enabled" && messengerOwnerKey != null;
  const streamIds = useMessengerStore((state) => state.streamIds);
  const streamsById = useMessengerStore((state) => state.streamsById);
  const topicIds = useMessengerStore((state) => state.topicIds);
  const topicsById = useMessengerStore((state) => state.topicsById);
  const [showWorkspaceReferences, setShowWorkspaceReferences] = useState(false);
  const [workspaceReferenceQuery, setWorkspaceReferenceQuery] = useState("");
  const [activeWorkspaceReferenceIndex, setActiveWorkspaceReferenceIndex] = useState(0);
  const [workspaceReferenceStartPos, setWorkspaceReferenceStartPos] = useState(0);
  const resetWorkspaceReferenceState = useCallback(() => {
    setShowWorkspaceReferences(false);
    setWorkspaceReferenceQuery("");
    setActiveWorkspaceReferenceIndex(0);
    setWorkspaceReferenceStartPos(0);
  }, []);
  const workspaceReferenceSuggestions = useMemo(() => {
    if (!workspaceReferencesEnabled) return [];
    return getWorkspaceComposerReferenceSuggestions({
      streamIds,
      streamsById,
      topicIds,
      topicsById,
      query: workspaceReferenceQuery,
    });
  }, [
    streamIds,
    streamsById,
    topicIds,
    topicsById,
    workspaceReferenceQuery,
    workspaceReferencesEnabled,
  ]);
  const composerSuggestions = showWorkspaceReferences
    ? workspaceReferenceSuggestions
    : mentionSuggestions;
  const showComposerSuggestions = showMentions || showWorkspaceReferences;
  const activeComposerSuggestionIndex = showWorkspaceReferences
    ? activeWorkspaceReferenceIndex
    : activeMentionIndex;
  const preservesWorkspaceReplyContext = editSession?.preserveWorkspaceReplyContext === true;
  const effectiveReplyQuote = isEditing && !preservesWorkspaceReplyContext ? null : replyQuote;
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerResize = useMessageComposerResize({
    composerRef,
    enabled: textareaContentHeight >= COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX,
    textareaContentHeight,
    textareaRef,
  });
  const textareaId = useId();
  const prevDisabledRef = useRef(disabled);
  const prevReplyQuoteIdRef = useRef<number | string | null>(null);
  const prevFocusKeyRef = useRef(focusKey);
  useLayoutEffect(() => {
    if (prevDisabledRef.current && !disabled && mode === "write") {
      textareaRef.current?.focus();
    }
    prevDisabledRef.current = disabled;
  }, [disabled, mode]);
  useLayoutEffect(() => {
    const replyId = effectiveReplyQuote?.id ?? null;
    const prevReplyId = prevReplyQuoteIdRef.current;
    prevReplyQuoteIdRef.current = replyId;
    if (replyId != null && replyId !== prevReplyId && !disabled && mode === "write") {
      textareaRef.current?.focus();
    }
  }, [effectiveReplyQuote, disabled, mode]);
  useLayoutEffect(() => {
    const previousFocusKey = prevFocusKeyRef.current;
    prevFocusKeyRef.current = focusKey;
    if (
      focusKey != null &&
      focusKey !== previousFocusKey &&
      !disabled &&
      !isEditing &&
      mode === "write"
    ) {
      textareaRef.current?.focus();
    }
  }, [disabled, focusKey, isEditing, mode]);
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
  } = useMessageComposerUpload({
    disabled: disabled || sendInFlight || isEditing || !uploadSupported,
    uploadProgress,
    onAddFiles: controlledAttachmentsEnabled ? onAddAttachments : undefined,
    existingFileNames: controlledAttachmentFileNames,
  });
  const latestValueRef = useRef(value);
  const latestFilesRef = useRef(files);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);
  useEffect(() => {
    latestFilesRef.current = files;
  }, [files]);
  const outgoingBody = useMemo(
    () =>
      (!isEditing || preservesWorkspaceReplyContext) && outgoingBodyOverride != null
        ? outgoingBodyOverride
        : buildOutgoingMessageBody(value, effectiveReplyQuote, workspaceComposerMentions),
    [
      effectiveReplyQuote,
      isEditing,
      outgoingBodyOverride,
      preservesWorkspaceReplyContext,
      value,
      workspaceComposerMentions,
    ],
  );
  const canSendWithEmptyActiveValue =
    allowEmptyActiveValueSend &&
    outgoingBodyOverride != null &&
    outgoingBodyOverride.trim().length > 0;
  const previewOutgoingBody = useMemo(() => {
    if (isEditing || !controlledAttachmentsEnabled) return outgoingBody;
    const readyMarkdown = (attachments ?? []).flatMap((attachment) =>
      attachment.status === "ready" && attachment.previewMarkdown != null
        ? [attachment.previewMarkdown]
        : [],
    );
    if (readyMarkdown.length === 0) return outgoingBody;
    const trimmedBody = outgoingBody.trim();
    return trimmedBody.length === 0
      ? readyMarkdown.join("\n")
      : `${trimmedBody}\n${readyMarkdown.join("\n")}`;
  }, [attachments, controlledAttachmentsEnabled, isEditing, outgoingBody]);
  const preview = useMessageComposerPreview({
    mode,
    outgoingBody: previewOutgoingBody,
    enabled: previewSupported,
    unsupportedText: previewCapability.unsupportedText,
    resolveMention,
  });
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
    if (savedSnippetsErrorCode === "unsupported") {
      return t("composer.savedSnippetsUnsupported");
    }
    return null;
  }, [savedSnippetsErrorCode]);
  const showUnsupportedAction = useCallback((capability: MessageComposerActionCapability) => {
    setUnsupportedActionText(capability.unsupportedText ?? t("composer.actionUnsupported"));
  }, []);
  const showAiMenuNotice = useCallback((capability: MessageComposerActionCapability) => {
    setAiMenuNotificationText(capability.unsupportedText ?? t("composer.actionUnsupported"));
    setAiMenuOpen(false);
    setMediaPickerOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setAiMenuOpen(true);
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

  const previewHtml = preview.html;
  const previewLoading = preview.loading;
  const previewError = preview.error;
  const resetMentionState = useCallback(() => {
    hideMentionDropdown();
    setMentionQuery("");
    setMentionStartPos(0);
    setActiveMentionIndex(0);
  }, [hideMentionDropdown, setActiveMentionIndex, setMentionQuery, setMentionStartPos]);

  useEffect(() => {
    if (!workspaceReferencesEnabled) {
      resetWorkspaceReferenceState();
    }
  }, [resetWorkspaceReferenceState, workspaceReferencesEnabled]);

  const detectMention = useCallback(
    (text: string, cursorPos: number) => {
      const before = text.slice(0, cursorPos);
      const match = /(?:^|[\s([{,.:;!?])([@#])(\S*)$/.exec(before);
      if (match == null) {
        resetMentionState();
        resetWorkspaceReferenceState();
        return;
      }

      const trigger = match[1];
      const query = match[2] ?? "";
      const startPos = cursorPos - query.length - 1;
      if (trigger === "@") {
        resetWorkspaceReferenceState();
        if (!mentionsSupported) {
          resetMentionState();
          return;
        }
        setMentionQuery(query);
        setMentionStartPos(startPos);
        showMentionDropdown();
        setActiveMentionIndex(0);
        return;
      }

      resetMentionState();
      if (!workspaceReferencesEnabled) {
        resetWorkspaceReferenceState();
        return;
      }
      setWorkspaceReferenceQuery(query);
      setWorkspaceReferenceStartPos(startPos);
      setShowWorkspaceReferences(true);
      setActiveWorkspaceReferenceIndex(0);
    },
    [
      mentionsSupported,
      resetMentionState,
      resetWorkspaceReferenceState,
      setMentionQuery,
      setMentionStartPos,
      showMentionDropdown,
      workspaceReferencesEnabled,
    ],
  );

  const handleMentionSelect = useCallback(
    (user: MentionSuggestion) => {
      const mention = workspaceComposerMentionsByUserUuid.get(user.userUuid);
      if (mention == null) return;
      const insertion = insertWorkspaceMention(
        value,
        mentionStartPos,
        textareaRef.current?.selectionStart ?? value.length,
        mention.visibleText,
      );
      setValue(insertion.value);
      resetMentionState();
      resetWorkspaceReferenceState();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(insertion.cursorPosition, insertion.cursorPosition);
      });
    },
    [
      mentionStartPos,
      resetMentionState,
      resetWorkspaceReferenceState,
      setValue,
      value,
      workspaceComposerMentionsByUserUuid,
    ],
  );

  const handleWorkspaceReferenceSelect = useCallback(
    (reference: WorkspaceComposerReference) => {
      const insertion = insertWorkspaceComposerReference(
        value,
        workspaceReferenceStartPos,
        textareaRef.current?.selectionStart ?? value.length,
        reference,
      );
      if (insertion == null) return;
      setValue(insertion.value);
      resetMentionState();
      resetWorkspaceReferenceState();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(insertion.cursorPosition, insertion.cursorPosition);
      });
    },
    [resetMentionState, resetWorkspaceReferenceState, setValue, value, workspaceReferenceStartPos],
  );

  const handleComposerSuggestionSelect = useCallback(
    (suggestion: ComposerSuggestion) => {
      if ("kind" in suggestion) {
        handleWorkspaceReferenceSelect(suggestion);
        return;
      }
      handleMentionSelect(suggestion);
    },
    [handleMentionSelect, handleWorkspaceReferenceSelect],
  );

  const handleHideComposerSuggestions = useCallback(() => {
    resetMentionState();
    resetWorkspaceReferenceState();
  }, [resetMentionState, resetWorkspaceReferenceState]);

  const clearComposerInput = useCallback(() => {
    if (effectiveReplyQuote) {
      onClearReply?.("submit");
    }
    setValue("");
    setFiles([]);
  }, [onClearReply, effectiveReplyQuote, setFiles, setValue]);

  const scheduleMessage = useCallback(
    (sendAt: number) => {
      if (!scheduledSendSupported) {
        showUnsupportedAction(scheduledSendCapability);
        return;
      }
      if (disabled || onSend == null) return;

      const subject = activeTopic ?? "";
      const scheduledMessage = buildScheduledComposerMessage({
        id: crypto.randomUUID(),
        content: outgoingBody,
        subject,
        value,
        files,
        canSendWithEmptyActiveValue,
        sendAt,
      });
      if (scheduledMessage == null) return;

      setScheduledMessages((prev) => [...prev, scheduledMessage]);
      setScheduleMenuOpen(false);
      clearComposerInput();
    },
    [
      activeTopic,
      clearComposerInput,
      disabled,
      files,
      onSend,
      outgoingBody,
      scheduledSendCapability,
      scheduledSendSupported,
      showUnsupportedAction,
      canSendWithEmptyActiveValue,
      value,
    ],
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
      if (disabled || sendInFlight || editSession == null || onSubmitEdit == null) return;
      const trimmed = value.trim();
      const content = preservesWorkspaceReplyContext ? outgoingBody : trimmed;
      if (content.length === 0) return;
      try {
        await onSubmitEdit(editSession.messageId, content);
      } catch {
        return;
      }
      return;
    }

    const hasText = value.trim().length > 0;
    const hasFiles = files.length > 0;
    const hasControlledAttachments = controlledAttachmentsEnabled && attachments.length > 0;
    const hasSendableExternalBody = canSendWithEmptyActiveValue;
    if (
      (!hasText && !hasSendableExternalBody && !hasFiles && !hasControlledAttachments) ||
      disabled ||
      sendInFlight ||
      attachmentsBlockSend
    )
      return;
    const subject = activeTopic ?? "";
    const bodyToSend = outgoingBody;
    const valueToSend = value;
    const filesSnapshot = files;
    const filesToSend = hasFiles ? [...files] : undefined;

    setSendInFlight(true);

    let sendResult: MessageComposerSendResult | void | Promise<void | MessageComposerSendResult>;
    try {
      sendResult = onSend?.(bodyToSend, subject, filesToSend);
    } catch {
      setSendInFlight(false);
      return;
    }

    if (optimisticClearOnSend) {
      setSendInFlight(false);
      resetMentionState();
      resetWorkspaceReferenceState();
      setValue("");
      setFiles([]);
      setMode("write");
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea || disabled) {
          return;
        }
        textarea.focus();
        textarea.setSelectionRange(0, 0);
      });
      if (effectiveReplyQuote) {
        onClearReply?.("submit");
      }
      setAiMenuOpen(false);
      setScheduleMenuOpen(false);
      setSavedSnippetsMenuOpen(false);
      setMediaPickerOpen(false);
      void Promise.resolve(sendResult).catch(() => undefined);
      return;
    }

    let completedSendResult: MessageComposerSendResult | void;
    try {
      completedSendResult = await sendResult;
    } catch {
      return;
    } finally {
      setSendInFlight(false);
    }
    resetMentionState();
    resetWorkspaceReferenceState();
    const shouldClearComposer = completedSendResult?.shouldClearComposer !== false;
    if (shouldClearComposer && latestValueRef.current === valueToSend) {
      setValue("");
    }
    if (latestFilesRef.current === filesSnapshot) {
      setFiles([]);
    }
    setMode("write");
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || disabled) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    });
    if (shouldClearComposer && effectiveReplyQuote) {
      onClearReply?.("submit");
    }
    setAiMenuOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setMediaPickerOpen(false);
  };

  const handleEmojiClick = (data: EmojiClickData) => {
    const emoji = data.emoji.trim();
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

      const clipboardFiles: { file: File; fallbackMime?: string }[] = [];
      for (const item of Array.from(items ?? [])) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file == null) continue;
        clipboardFiles.push({ file, fallbackMime: item.type });
      }

      if (uploadSupported && clipboardFiles.length > 0) {
        e.preventDefault();
        if (controlledAttachmentsEnabled) {
          onAddAttachments(
            prepareAttachmentFiles(clipboardFiles, {
              source: "clipboard",
              existingFiles: controlledAttachmentFileNames.map((name) => new File([], name)),
            }),
          );
          return;
        }
        setFiles((prev) => [
          ...prev,
          ...prepareAttachmentFiles(clipboardFiles, {
            source: "clipboard",
            existingFiles: prev,
          }),
        ]);
        return;
      }

      const pastedText = e.clipboardData?.getData("text/plain") ?? "";
      if (pastedText.length === 0) return;
      const convertedText = replaceWorkspaceComposerLinks(
        pastedText,
        { streamsById, topicsById },
        typeof window === "undefined" ? null : window.location.origin,
      );
      if (convertedText === pastedText) return;

      e.preventDefault();
      const textarea = textareaRef.current;
      const selectionStart = textarea?.selectionStart ?? value.length;
      const selectionEnd = textarea?.selectionEnd ?? value.length;
      const nextValue = value.slice(0, selectionStart) + convertedText + value.slice(selectionEnd);
      const nextCursor = selectionStart + convertedText.length;
      setValue(nextValue);
      detectMention(nextValue, nextCursor);
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [
      controlledAttachmentFileNames,
      controlledAttachmentsEnabled,
      detectMention,
      isEditing,
      onAddAttachments,
      setFiles,
      setValue,
      streamsById,
      topicsById,
      uploadSupported,
      value,
    ],
  );

  const handleAttachClick = () => {
    if (disabled || isEditing) return;
    // Upload UI остаётся на месте, но без Workspace upload contract не открываем системный выбор файла.
    if (!uploadSupported) {
      showAiMenuNotice(uploadCapability);
      return;
    }
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
      if (!uploadSupported) {
        showAiMenuNotice(uploadCapability);
        return;
      }
      handleFileChangeFromHook(event as React.ChangeEvent<HTMLInputElement>);
    },
    [handleFileChangeFromHook, showAiMenuNotice, uploadCapability, uploadSupported],
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
    const contentHeight = Math.max(textarea.scrollHeight, COMPOSER_TEXTAREA_MIN_HEIGHT_PX);
    setTextareaContentHeight(contentHeight);
    if (composerResize.height != null) {
      textarea.style.height = "100%";
      return;
    }
    const nextHeight = Math.min(
      Math.max(contentHeight, COMPOSER_TEXTAREA_MIN_HEIGHT_PX),
      COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
    );
    textarea.style.height = `${nextHeight}px`;
  }, [composerResize.height]);

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
    // Scheduled send ещё не имеет Workspace endpoint, значит не создаём локальную отложенную отправку.
    if (!scheduledSendSupported) {
      showUnsupportedAction(scheduledSendCapability);
      return;
    }
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
  }, [
    scheduledSendCapability,
    scheduledSendSupported,
    showUnsupportedAction,
    updateScheduleMenuPosition,
  ]);

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

  React.useEffect(() => {
    if (!aiMenuOpen) {
      setAiMenuNotificationText(null);
    }
  }, [aiMenuOpen]);

  const toggleAiUnavailablePopover = useCallback(() => {
    setMediaPickerOpen(false);
    setScheduleMenuOpen(false);
    setSavedSnippetsMenuOpen(false);
    setAiMenuNotificationText(null);
    setAiMenuOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        updateAiMenuPosition();
      }
      return nextOpen;
    });
  }, [updateAiMenuPosition]);

  const toggleSavedSnippetsMenu = useCallback(() => {
    // Workspace routes show a controlled placeholder instead of legacy requests.
    if (!savedSnippetsSupported) {
      showAiMenuNotice(savedSnippetsCapability);
      setSavedSnippetsMenuOpen(false);
      return;
    }
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
  }, [
    clearSavedSnippetsError,
    openSavedSnippets,
    savedSnippetsCapability,
    savedSnippetsSupported,
    showAiMenuNotice,
    updateSavedSnippetsMenuPosition,
  ]);

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

  const handleModeChange = useCallback(
    (nextMode: ComposerMode) => {
      if (nextMode === "preview" && !previewSupported) {
        showAiMenuNotice(previewCapability);
        setMode("write");
        return;
      }
      setMode(nextMode);
    },
    [previewCapability, previewSupported, showAiMenuNotice],
  );

  React.useEffect(() => {
    if (mode !== "preview" || previewSupported) return;
    setMode("write");
    showAiMenuNotice(previewCapability);
  }, [mode, previewCapability, previewSupported, showAiMenuNotice]);

  const resizeHandleVisible =
    textareaContentHeight >= COMPOSER_TEXTAREA_RESIZE_HANDLE_MIN_HEIGHT_PX ||
    composerResize.height != null;
  const heightButtonVisible =
    textareaContentHeight >= COMPOSER_TEXTAREA_HEIGHT_BUTTON_MIN_HEIGHT_PX ||
    composerResize.height != null;
  const toolbarRow = (
    <MessageComposerToolbarRow
      expanded={isToolbarExpanded}
      onExpandedChange={setIsToolbarExpanded}
      mode={mode}
      onModeChange={handleModeChange}
      showPreviewTab={previewSupported}
      isEditing={isEditing}
      disabled={disabled}
      uploadSupported={uploadSupported}
      uploadCapability={uploadCapability}
      scheduledSendSupported={scheduledSendSupported}
      scheduledSendCapability={scheduledSendCapability}
      savedSnippetsSupported={savedSnippetsSupported}
      onCreateCallLink={onCreateCallLink}
      onAttachClick={handleAttachClick}
      onCreateCallLinkClick={handleCreateCallLink}
      onToggleScheduleMenu={toggleScheduleMenu}
      onToggleSavedSnippetsMenu={toggleSavedSnippetsMenu}
      onToggleAiUnavailablePopover={toggleAiUnavailablePopover}
      onToggleMediaPicker={() => toggleMediaPicker("emoji")}
      onValueChange={setValue}
      textareaRef={textareaRef}
      scheduleButtonRef={scheduleButtonRef}
      savedSnippetsButtonRef={savedSnippetsButtonRef}
      aiButtonAnchorRef={aiButtonAnchorRef}
      emojiButtonRef={emojiButtonRef}
      aiMenuOpen={aiMenuOpen}
      emojiPickerOpen={mediaPickerOpen && mediaPickerTab === "emoji"}
    />
  );
  const writeBody = (
    <div
      key="composer-write-body"
      className="relative flex min-h-0 min-w-0 flex-1 items-center self-stretch"
    >
      <MessageComposerWriteBody
        value={value}
        placeholder={placeholder}
        disabled={disabled || sendInFlight}
        textareaRef={textareaRef}
        textareaId={textareaId}
        showMentions={showComposerSuggestions}
        mentionSuggestions={composerSuggestions}
        activeMentionIndex={activeComposerSuggestionIndex}
        onActiveMentionIndexChange={(nextIndex) => {
          if (showWorkspaceReferences) {
            setActiveWorkspaceReferenceIndex(nextIndex);
          } else {
            setActiveMentionIndex(nextIndex);
          }
        }}
        onMentionSelect={handleComposerSuggestionSelect}
        onHideMentionDropdown={handleHideComposerSuggestions}
        onValueChange={setValue}
        onDetectMention={detectMention}
        applyFormattingShortcut={applyFormattingShortcut}
        onPaste={handlePaste}
        onSend={handleSend}
        sendNewlineMode={sendNewlineMode}
        onEditLastMessage={onEditLastMessage}
        isEditing={isEditing}
        onCancelEdit={onCancelEdit}
        fillAvailableHeight={composerResize.height != null}
        reserveExpandControlSpace={isToolbarExpanded && heightButtonVisible}
        compactInline={!isToolbarExpanded}
      />
    </div>
  );
  const isCompactWriteMode = mode === "write" && !isToolbarExpanded;
  // pl-3 instead of pl-5: slightly closer leading toolbar toggle, more width for the message body
  const inputRowLayout = isCompactWriteMode ? "items-end gap-5 py-1 pl-3 pr-5" : "";
  // Opaque reply chrome sits under overflow-visible; it must carry top radius itself.
  const replyChromeRoundsTop = !joinedTop && !isEditing;

  return (
    <div
      ref={composerRef}
      className={`relative flex flex-shrink-0 flex-col overflow-visible bg-composer-outer ${
        joinedTop ? "rounded-b-xl" : "rounded-xl"
      } ${
        isEditing || joinedTop ? "" : "border-t border-border-subtle"
      } ${isDragOver ? "ring-2 ring-inset ring-accent" : ""}`}
      data-focus-zone="composer"
      role="form"
      aria-label={t("a11y.messageComposer")}
      style={{
        ...(composerKeyboardInset > 0
          ? { paddingBottom: `${composerKeyboardInset}px` }
          : undefined),
        ...(composerResize.height != null ? { height: `${composerResize.height}px` } : undefined),
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {resizeHandleVisible && (
        <MessageComposerResizeHandle
          onPointerDown={composerResize.onResizeHandlePointerDown}
          onKeyDown={composerResize.onResizeHandleKeyDown}
        />
      )}
      {isEditing && preservesWorkspaceReplyContext ? (
        <MessageComposerEditNotice onCancelEdit={onCancelEdit} joinedTop={joinedTop} />
      ) : null}
      <MessageComposerPreface
        uploadProgress={uploadProgress}
        uploadProgressPercent={uploadProgressPercent}
        separateUploadProgress={optimisticClearOnSend}
        files={files}
        filePreviewUrls={filePreviewUrls}
        showFiles={mode === "write"}
        isUploadInProgress={isUploadInProgress}
        onCancelUpload={onCancelUpload}
        removeFile={removeFile}
        attachments={!isEditing && mode === "write" ? attachments : []}
        onRemoveAttachment={!isEditing ? onRemoveAttachment : undefined}
        onRetryAttachment={!isEditing ? onRetryAttachment : undefined}
        scheduledMessages={scheduledMessages}
        onCancelScheduled={cancelScheduledMessage}
        replyQuote={effectiveReplyQuote}
        onClearReply={onClearReply}
        replyLeadingContent={!isEditing || preservesWorkspaceReplyContext ? leadingContent : null}
        isEditing={isEditing}
        showReplyWhileEditing={preservesWorkspaceReplyContext}
        hideEditNotice={preservesWorkspaceReplyContext}
        joinedTop={joinedTop}
        roundTop={replyChromeRoundsTop}
        onCancelEdit={onCancelEdit}
      />

      {!isEditing && <MessageComposerSmartReplyStrip onAccept={setValue} />}

      <div className="relative flex min-h-0 flex-1 flex-col p-2">
        {unsupportedActionText != null && (
          <div className="mb-2 px-1 text-xs text-notice-base" role="status">
            {unsupportedActionText}
          </div>
        )}
        {!isEditing && (
          <MessageComposerAiActionMenuLayer
            open={aiMenuOpen}
            draft={value}
            onInsert={setValue}
            onOpenChange={setAiMenuOpen}
            notificationMessage={aiMenuNotificationText ?? undefined}
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleFileInputEvent}
          onInput={handleFileInputEvent}
          accept="*/*"
        />

        {mediaPickerOpen && (
          <MessageComposerMediaPickerPopover
            mediaPickerStyle={mediaPickerStyle}
            mediaPickerTab={mediaPickerTab}
            onClose={() => setMediaPickerOpen(false)}
            onTabChange={(tab) => {
              setMediaPickerTab(tab);
              updateMediaPickerPosition(tab);
            }}
            onEmojiClick={handleEmojiClick}
            onStickerSelect={(markdown) => {
              setValue((prev) => prev + markdown);
              setMediaPickerOpen(false);
            }}
          />
        )}

        <div className="flex min-h-0 flex-1 items-end gap-3">
          <div
            className={`relative flex min-h-12 min-w-0 flex-1 flex-col overflow-visible rounded-xl bg-bg outline-none transition-[outline-color] focus-within:outline-1 focus-within:outline-offset-0 focus-within:outline-accent-soft ${
              composerResize.height != null ? "self-stretch" : "self-end"
            }`}
          >
            {heightButtonVisible && (
              <MessageComposerHeightButton
                isFullHeight={composerResize.isFullHeight}
                onClick={composerResize.toggleFullHeight}
              />
            )}

            <div
              data-testid={isCompactWriteMode ? "composer-compact-input-row" : undefined}
              className={`relative flex min-h-0 min-w-0 flex-1 ${inputRowLayout}`}
            >
              {mode === "write" ? (
                <>
                  <div className="flex min-h-0 min-w-0 flex-1 items-end gap-2 self-stretch">
                    {!isToolbarExpanded ? (
                      <MessageComposerCompactLeadingControls
                        onExpandedChange={setIsToolbarExpanded}
                      />
                    ) : null}
                    {writeBody}
                  </div>
                  {!isToolbarExpanded ? (
                    <MessageComposerCompactTrailingControls
                      isEditing={isEditing}
                      disabled={disabled}
                      uploadSupported={uploadSupported}
                      uploadCapability={uploadCapability}
                      onAttachClick={handleAttachClick}
                      onToggleMediaPicker={() => toggleMediaPicker("emoji")}
                      emojiButtonRef={emojiButtonRef}
                      emojiPickerOpen={mediaPickerOpen && mediaPickerTab === "emoji"}
                    />
                  ) : null}
                </>
              ) : (
                <MessageComposerPreviewBody
                  outgoingBodyTrim={previewOutgoingBody.trim()}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  previewHtml={previewHtml}
                  previewMetadata={preview.metadata}
                  fileReferences={preview.fileReferences}
                  onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
                  files={!isEditing ? files : []}
                  filePreviewUrls={!isEditing ? filePreviewUrls : []}
                  removeFile={!isEditing ? removeFile : undefined}
                  attachments={!isEditing ? attachments : []}
                  onRemoveAttachment={!isEditing ? onRemoveAttachment : undefined}
                  onRetryAttachment={!isEditing ? onRetryAttachment : undefined}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={
              disabled ||
              sendInFlight ||
              (!isEditing && attachmentsBlockSend) ||
              (isEditing && value.trim().length === 0)
            }
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center self-end rounded-xl bg-composer-send text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label={isEditing ? t("common.save") : t("chat.sendPlaceholder")}
          >
            <MessageComposerSendIcon className="text-on-accent" />
          </button>
        </div>
        {isToolbarExpanded && <div className="mr-[60px] mt-2">{toolbarRow}</div>}
      </div>
    </div>
  );
};

export const MessageComposer: React.FC<MessageComposerProps> = (props) => (
  <WidgetErrorBoundary sectionLabel={t("chat.sendPlaceholder")}>
    <MessageComposerInner {...props} />
  </WidgetErrorBoundary>
);
