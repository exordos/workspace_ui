import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { t } from "~/i18n/i18n";
import CheckIconRaw from "~/shared/assets/icons/check.svg?raw";
import CopyIconRaw from "~/shared/assets/icons/copy.svg?raw";
import { writeText } from "~/shared/lib/clipboard";
import { createLogger } from "~/shared/lib/logger";
import { isValidUrl } from "~/shared/lib/validation";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  WorkspaceMessageBubbleMenuAnchor,
  WorkspaceMessageBubbleMenuSource,
} from "./workspace-message-bubble-menu.types";
import type { WorkspaceMessageConversationReference } from "./workspace-message-list.types";

const MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX = 6;
const CODE_COPY_RESET_MS = 1200;
const UNSAFE_BODY_LINK_PROTOCOL_PATTERN = /^(?:javascript|data|file|blob):/i;
const WORKSPACE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const workspaceMessageBodyInteractionsLog = createLogger("workspace-message-body-interactions");

interface WorkspaceCodeCopyButtonMount {
  button: HTMLButtonElement;
  iconHost: HTMLSpanElement;
  clickHandler: (event: MouseEvent) => void;
  resetTimerId: number | null;
}

export interface UseWorkspaceMessageBodyInteractionsParams {
  bodyRef: RefObject<HTMLDivElement | null>;
  renderedHtml: string;
  enableCodeCopy: boolean;
  fileReferences: readonly WorkspaceMessageFileReference[];
  onOpenMentionUser?: (userUuid: string) => void;
  onOpenMessageInChat?: (messageUuid: string) => void;
  onOpenWorkspaceReference?: (reference: WorkspaceMessageConversationReference) => void;
  onDownloadFile?: (file: WorkspaceMessageFileReference) => void | Promise<void>;
  onOpenWorkspaceMedia?: (file: WorkspaceMessageFileReference) => void | Promise<void>;
  onOpenUnsupportedFilePreview?: (file: WorkspaceMessageFileReference) => void;
}

export interface UseWorkspaceMessageBodyInteractionsResult {
  menuOpen: boolean;
  menuSource: WorkspaceMessageBubbleMenuSource;
  contextMenuAnchor: WorkspaceMessageBubbleMenuAnchor | null;
  getSelectedText: () => string | undefined;
  handleBodyClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  handleMenuOpenChange: (nextOpen: boolean) => void;
  handleMenuSourceChange: (nextSource: WorkspaceMessageBubbleMenuSource) => void;
}

function resolveSelectionInsideBody(bodyElement: HTMLDivElement | null): string | undefined {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();
  const anchorNode = selection?.anchorNode;
  const focusNode = selection?.focusNode;

  if (
    selectedText == null ||
    selectedText.length === 0 ||
    bodyElement == null ||
    anchorNode == null ||
    focusNode == null ||
    !bodyElement.contains(anchorNode.parentElement ?? anchorNode) ||
    !bodyElement.contains(focusNode.parentElement ?? focusNode)
  ) {
    return undefined;
  }

  return selectedText;
}

function isPrimaryUnmodifiedClick(event: ReactMouseEvent<HTMLElement>): boolean {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function isInteractiveTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("a,button,input,textarea,select,[contenteditable='true']") != null
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function setCodeCopyButtonState(
  mount: WorkspaceCodeCopyButtonMount,
  state: "idle" | "success" | "error",
): void {
  mount.button.dataset.copyState = state;
  mount.button.setAttribute(
    "aria-label",
    state === "success"
      ? t("message.copied")
      : state === "error"
        ? t("message.copyFailed")
        : t("message.copy"),
  );
  mount.button.setAttribute(
    "title",
    state === "success"
      ? t("message.copied")
      : state === "error"
        ? t("message.copyFailed")
        : t("message.copy"),
  );
  mount.iconHost.innerHTML = state === "success" ? CheckIconRaw : CopyIconRaw;
}

function mountCodeCopyButton(codeBlock: HTMLElement): WorkspaceCodeCopyButtonMount | null {
  const preElement = codeBlock.parentElement;
  if (!(preElement instanceof HTMLElement)) {
    return null;
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.codeCopyButton = "true";
  copyButton.dataset.copyState = "idle";
  copyButton.className =
    "message-code-copy-btn inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-composer-icon transition-colors hover:border-border-subtle hover:bg-sidebar-hover hover:text-icon-active focus-visible:border-border-subtle focus-visible:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

  const iconHost = document.createElement("span");
  iconHost.className =
    "pointer-events-none inline-flex h-3.5 w-3.5 items-center justify-center text-current [&>svg]:h-full [&>svg]:w-full";
  copyButton.appendChild(iconHost);

  const mount: WorkspaceCodeCopyButtonMount = {
    button: copyButton,
    iconHost,
    clickHandler: () => {},
    resetTimerId: null,
  };

  mount.clickHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const source = codeBlock.textContent ?? "";
    if (source.trim().length === 0) {
      return;
    }

    if (mount.resetTimerId != null) {
      window.clearTimeout(mount.resetTimerId);
      mount.resetTimerId = null;
    }

    void writeText(source).then((ok) => {
      setCodeCopyButtonState(mount, ok ? "success" : "error");
      mount.resetTimerId = window.setTimeout(() => {
        mount.resetTimerId = null;
        setCodeCopyButtonState(mount, "idle");
      }, CODE_COPY_RESET_MS);
    });
  };

  setCodeCopyButtonState(mount, "idle");
  copyButton.addEventListener("click", mount.clickHandler);
  preElement.appendChild(copyButton);

  return mount;
}

function mountCodeCopyButtons(bodyElement: HTMLDivElement): WorkspaceCodeCopyButtonMount[] {
  const mounts: WorkspaceCodeCopyButtonMount[] = [];
  const codeBlocks = bodyElement.querySelectorAll<HTMLElement>("pre > code");

  for (const codeBlock of codeBlocks) {
    const mount = mountCodeCopyButton(codeBlock);
    if (mount != null) {
      mounts.push(mount);
    }
  }

  return mounts;
}

function teardownCodeCopyButtons(mounts: WorkspaceCodeCopyButtonMount[]): void {
  for (const mount of mounts) {
    if (mount.resetTimerId != null) {
      window.clearTimeout(mount.resetTimerId);
    }
    mount.button.removeEventListener("click", mount.clickHandler);
    mount.iconHost.innerHTML = "";
    mount.button.remove();
  }
}

function toggleWorkspaceSpoiler(target: HTMLElement, bodyElement: HTMLElement): boolean {
  const spoilerHeader = target.closest<HTMLElement>(".spoiler-header");
  if (spoilerHeader != null && bodyElement.contains(spoilerHeader)) {
    spoilerHeader.closest(".spoiler-block")?.classList.toggle("open");
    return true;
  }

  const inlineSpoiler = target.closest<HTMLElement>(".inline-spoiler");
  if (inlineSpoiler != null && bodyElement.contains(inlineSpoiler)) {
    inlineSpoiler.classList.toggle("open");
    return true;
  }

  return false;
}

function resolveExternalHttpUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!isValidUrl(trimmed)) {
    return null;
  }

  return trimmed;
}

function resolveWorkspaceFileReferenceFromClick(
  target: HTMLElement,
  bodyElement: HTMLDivElement,
  fileReferences: readonly WorkspaceMessageFileReference[],
): WorkspaceMessageFileReference | null {
  const fileElement = target.closest<HTMLElement>(
    "[data-workspace-file='true'][data-workspace-file-uuid][data-workspace-file-kind]",
  );
  if (fileElement == null || !bodyElement.contains(fileElement)) {
    return null;
  }

  const fileUuid = fileElement.dataset.workspaceFileUuid?.trim();
  const fileKind = fileElement.dataset.workspaceFileKind?.trim();
  if (fileUuid == null || fileUuid.length === 0) {
    return null;
  }

  return (
    fileReferences.find((reference) => {
      return reference.fileUuid === fileUuid && reference.kind === fileKind;
    }) ?? null
  );
}

function resolveWorkspaceConversationReferenceFromClick(
  target: HTMLElement,
  bodyElement: HTMLDivElement,
): WorkspaceMessageConversationReference | null {
  const referenceElement = target.closest<HTMLElement>(
    "[data-workspace-reference='true'][data-workspace-reference-kind]",
  );
  if (referenceElement == null || !bodyElement.contains(referenceElement)) {
    return null;
  }

  const kind = referenceElement.dataset.workspaceReferenceKind;
  const streamUuid = referenceElement.dataset.workspaceStreamUuid?.trim();
  if (kind === "stream") {
    return streamUuid != null && WORKSPACE_UUID_PATTERN.test(streamUuid)
      ? { kind, streamUuid }
      : null;
  }

  if (kind !== "topic") {
    return null;
  }

  const topicUuid = referenceElement.dataset.workspaceTopicUuid?.trim();
  if (topicUuid == null || !WORKSPACE_UUID_PATTERN.test(topicUuid)) {
    return null;
  }

  if (streamUuid == null) {
    return { kind, topicUuid };
  }

  return WORKSPACE_UUID_PATTERN.test(streamUuid) ? { kind, streamUuid, topicUuid } : null;
}

export function useWorkspaceMessageBodyInteractions({
  bodyRef,
  renderedHtml,
  enableCodeCopy,
  fileReferences,
  onOpenMentionUser,
  onOpenMessageInChat,
  onOpenWorkspaceReference,
  onDownloadFile,
  onOpenWorkspaceMedia,
  onOpenUnsupportedFilePreview,
}: UseWorkspaceMessageBodyInteractionsParams): UseWorkspaceMessageBodyInteractionsResult {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSource, setMenuSource] = useState<WorkspaceMessageBubbleMenuSource>("trigger");
  const [contextMenuAnchor, setContextMenuAnchor] =
    useState<WorkspaceMessageBubbleMenuAnchor | null>(null);
  const capturedSelectionRef = useRef<string | undefined>(undefined);
  const pendingDownloadFileUuidsRef = useRef<Set<string>>(new Set());
  const latestFileReferencesRef = useRef(fileReferences);

  useEffect(() => {
    latestFileReferencesRef.current = fileReferences;
  }, [fileReferences]);

  const getSelectedText = useCallback((): string | undefined => {
    return capturedSelectionRef.current ?? resolveSelectionInsideBody(bodyRef.current);
  }, [bodyRef]);

  const openTriggerMenu = useCallback(() => {
    capturedSelectionRef.current = resolveSelectionInsideBody(bodyRef.current);
    setContextMenuAnchor(null);
    setMenuSource("trigger");
    setMenuOpen(true);
  }, [bodyRef]);

  const openContextMenuAt = useCallback(
    (clientX: number, clientY: number) => {
      capturedSelectionRef.current = resolveSelectionInsideBody(bodyRef.current);
      setContextMenuAnchor({
        left: clientX + MESSAGE_CONTEXT_MENU_CURSOR_GAP_PX,
        top: clientY,
      });
      setMenuSource("context");
      setMenuOpen(true);
    },
    [bodyRef],
  );

  const requestWorkspaceFileDownload = useCallback(
    (workspaceFile: WorkspaceMessageFileReference): boolean => {
      if (onDownloadFile == null) {
        return false;
      }

      const fileUuid = workspaceFile.fileUuid.trim();
      if (fileUuid.length > 0 && pendingDownloadFileUuidsRef.current.has(fileUuid)) {
        return true;
      }

      if (fileUuid.length > 0) {
        pendingDownloadFileUuidsRef.current.add(fileUuid);
      }

      let result: void | Promise<void>;
      try {
        result = onDownloadFile(workspaceFile);
      } catch (error) {
        if (fileUuid.length > 0) {
          pendingDownloadFileUuidsRef.current.delete(fileUuid);
        }
        throw error;
      }

      if (isPromiseLike(result)) {
        void Promise.resolve(result)
          .catch(() => undefined)
          .finally(() => {
            if (fileUuid.length > 0) {
              pendingDownloadFileUuidsRef.current.delete(fileUuid);
            }
          });
        return true;
      }

      if (fileUuid.length > 0) {
        pendingDownloadFileUuidsRef.current.delete(fileUuid);
      }
      return true;
    },
    [onDownloadFile],
  );

  const requestWorkspaceMediaOpen = useCallback(
    (workspaceFile: WorkspaceMessageFileReference): boolean => {
      if (
        onOpenWorkspaceMedia == null ||
        workspaceFile.kind !== "media" ||
        (workspaceFile.mediaKind !== "image" && workspaceFile.mediaKind !== "video")
      ) {
        return false;
      }

      void onOpenWorkspaceMedia(workspaceFile);
      return true;
    },
    [onOpenWorkspaceMedia],
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      openContextMenuAt(event.clientX, event.clientY);
    },
    [openContextMenuAt],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.target instanceof HTMLElement && (event.key === "Enter" || event.key === " ")) {
        if (event.target.closest("video[data-workspace-file-preview='true']") != null) {
          return;
        }
        if (event.target.closest("button") != null) {
          return;
        }
        if (toggleWorkspaceSpoiler(event.target, event.currentTarget)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const workspaceFile = resolveWorkspaceFileReferenceFromClick(
          event.target,
          event.currentTarget,
          latestFileReferencesRef.current,
        );
        if (workspaceFile != null) {
          event.preventDefault();
          if (requestWorkspaceMediaOpen(workspaceFile)) {
            return;
          }
          if (requestWorkspaceFileDownload(workspaceFile)) {
            return;
          }
          if (workspaceFile.kind === "media") {
            onOpenUnsupportedFilePreview?.(workspaceFile);
          }
          return;
        }
      }

      const isKeyboardContextMenu =
        event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
      if (!isKeyboardContextMenu || isInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
      openTriggerMenu();
    },
    [
      onOpenUnsupportedFilePreview,
      openTriggerMenu,
      requestWorkspaceFileDownload,
      requestWorkspaceMediaOpen,
    ],
  );

  const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    if (!nextOpen) {
      capturedSelectionRef.current = undefined;
      setContextMenuAnchor(null);
    }
  }, []);

  const handleMenuSourceChange = useCallback((nextSource: WorkspaceMessageBubbleMenuSource) => {
    setMenuSource(nextSource);
    if (nextSource === "trigger") {
      setContextMenuAnchor(null);
    }
  }, []);

  const handleBodyClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest("video[data-workspace-file-preview='true']") != null) {
        return;
      }

      const workspaceFile = resolveWorkspaceFileReferenceFromClick(
        target,
        event.currentTarget,
        latestFileReferencesRef.current,
      );
      if (workspaceFile != null) {
        event.preventDefault();
        event.stopPropagation();
        if (!isPrimaryUnmodifiedClick(event)) {
          return;
        }

        if (requestWorkspaceMediaOpen(workspaceFile)) {
          return;
        }

        if (requestWorkspaceFileDownload(workspaceFile)) {
          // Download uses Workspace UUID from the parsed document. DOM only tells
          // where the click happened here; it does not become the source of
          // download/gallery items and does not bring back the old path-only key.
          return;
        }

        if (workspaceFile.kind === "media") {
          // If the surface did not pass a download callback, media does not go to
          // the old viewer and does not get a fake preview. Show only the explicit
          // unsupported state for this surface.
          onOpenUnsupportedFilePreview?.(workspaceFile);
        }
        return;
      }

      const copyButton = target.closest("[data-code-copy-button='true']");
      if (copyButton != null) {
        return;
      }

      const mention = target.closest<HTMLElement>(
        "[data-workspace-mention='true'][data-workspace-user-uuid]",
      );
      if (mention != null && event.currentTarget.contains(mention)) {
        const userUuid = mention.dataset.workspaceUserUuid?.trim();
        event.preventDefault();
        if (userUuid != null && userUuid.length > 0 && isPrimaryUnmodifiedClick(event)) {
          // Mention click does not try to open the old DM/profile path. If the
          // surface passed a Workspace UUID callback, call it; otherwise the
          // action stays explicitly unsupported without imitation.
          onOpenMentionUser?.(userUuid);
        }
        return;
      }

      if (toggleWorkspaceSpoiler(target, event.currentTarget)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link == null || !event.currentTarget.contains(link)) {
        return;
      }

      const href = link.getAttribute("href") ?? "";
      if (UNSAFE_BODY_LINK_PROTOCOL_PATTERN.test(href.trim())) {
        event.preventDefault();
        return;
      }

      if (link.dataset.workspaceMessageLink === "true") {
        const messageUuid = link.dataset.workspaceMessageUuid?.trim();
        event.preventDefault();
        if (
          messageUuid != null &&
          WORKSPACE_UUID_PATTERN.test(messageUuid) &&
          isPrimaryUnmodifiedClick(event)
        ) {
          onOpenMessageInChat?.(messageUuid);
        }
        return;
      }

      const workspaceReference = resolveWorkspaceConversationReferenceFromClick(
        link,
        event.currentTarget,
      );
      if (workspaceReference != null) {
        event.preventDefault();
        if (!isPrimaryUnmodifiedClick(event)) {
          return;
        }

        if (onOpenWorkspaceReference == null) {
          workspaceMessageBodyInteractionsLog.warn(
            "Workspace conversation reference has no open callback",
            { kind: workspaceReference.kind },
          );
          return;
        }

        onOpenWorkspaceReference(workspaceReference);
        return;
      }

      const externalUrl = resolveExternalHttpUrl(href);
      if (externalUrl == null || !isPrimaryUnmodifiedClick(event)) {
        return;
      }

      event.preventDefault();
      window.open(externalUrl, "_blank", "noopener,noreferrer");
    },
    [
      onOpenMentionUser,
      onOpenMessageInChat,
      onOpenWorkspaceReference,
      onOpenUnsupportedFilePreview,
      requestWorkspaceFileDownload,
      requestWorkspaceMediaOpen,
    ],
  );

  useEffect(() => {
    if (!enableCodeCopy) {
      return;
    }

    const bodyElement = bodyRef.current;
    if (bodyElement == null) {
      return;
    }

    const mounts = mountCodeCopyButtons(bodyElement);
    return () => {
      teardownCodeCopyButtons(mounts);
    };
  }, [bodyRef, enableCodeCopy, renderedHtml]);

  return {
    menuOpen,
    menuSource,
    contextMenuAnchor,
    getSelectedText,
    handleBodyClick,
    handleContextMenu,
    handleKeyDown,
    handleMenuOpenChange,
    handleMenuSourceChange,
  };
}
