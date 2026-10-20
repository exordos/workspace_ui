import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/shared/ui/button";
import type { WorkspaceMessageBubbleQuickAction } from "./workspace-message-bubble-quick-actions.ui";
import type { KeyboardEvent, ReactElement } from "react";

interface WorkspaceMessageBubbleReactionProps {
  readonly action: WorkspaceMessageBubbleQuickAction;
  readonly isOwn: boolean;
}

function availableCapsuleHeight(anchor: HTMLDivElement): number {
  let viewportTop = 8;
  let parent = anchor.parentElement;
  while (parent != null) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) {
      viewportTop = Math.max(viewportTop, parent.getBoundingClientRect().top + 4);
      break;
    }
    parent = parent.parentElement;
  }
  return Math.min(176, Math.max(40, anchor.getBoundingClientRect().bottom - viewportTop));
}

export function WorkspaceMessageBubbleReaction({
  action,
  isOwn,
}: Readonly<WorkspaceMessageBubbleReactionProps>): ReactElement {
  const [open, setOpen] = useState(false);
  const [capsuleHeight, setCapsuleHeight] = useState(176);
  const anchorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reactionRefs = useRef(new Map<string, HTMLButtonElement>());
  const suppressFocusOpen = useRef(false);
  const touchPreview = useRef(false);
  const mouseFocus = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardTarget = useRef<"first" | "last" | null>(null);
  const reactions = useMemo(
    () => (action.reactions?.length ? action.reactions : [action]),
    [action],
  );

  const cancelHover = () => {
    if (hoverTimer.current != null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  const showReactions = () => {
    cancelHover();
    if (reactions.length < 2) return;
    if (anchorRef.current != null) setCapsuleHeight(availableCapsuleHeight(anchorRef.current));
    setOpen(true);
  };

  const closeAndFocusTrigger = () => {
    cancelHover();
    suppressFocusOpen.current = true;
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(
    () => () => {
      if (hoverTimer.current != null) clearTimeout(hoverTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!open) {
      if (scrollRef.current != null) scrollRef.current.scrollTop = 0;
      return;
    }
    if (keyboardTarget.current == null) return;
    const enabled = reactions.filter((reaction) => !reaction.disabled && !reaction.pending);
    const target = keyboardTarget.current === "first" ? enabled[0] : enabled.at(-1);
    keyboardTarget.current = null;
    if (target != null) reactionRefs.current.get(target.key)?.focus();
  }, [open, reactions]);

  const handleReactionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    reaction: WorkspaceMessageBubbleQuickAction,
  ) => {
    if (event.key === "Escape") {
      cancelHover();
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusTrigger();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!open) {
      keyboardTarget.current = event.key === "ArrowUp" || event.key === "End" ? "last" : "first";
      showReactions();
      return;
    }
    const enabled = reactions.filter((item) => !item.disabled && !item.pending);
    const index = enabled.findIndex((item) => item.key === reaction.key);
    let target: WorkspaceMessageBubbleQuickAction | undefined;
    if (event.key === "ArrowUp") target = enabled.at(index - 1);
    else if (event.key === "ArrowDown") target = enabled[(index + 1) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else target = enabled.at(-1);
    if (target != null) reactionRefs.current.get(target.key)?.focus();
  };

  return (
    <div
      ref={anchorRef}
      className="relative h-6 w-6 shrink-0"
      role="group"
      onMouseEnter={() => {
        cancelHover();
        if (open) return;
        hoverTimer.current = setTimeout(showReactions, 150);
      }}
      onMouseLeave={() => {
        cancelHover();
        hoverTimer.current = setTimeout(() => {
          hoverTimer.current = null;
          setOpen(false);
        }, 200);
      }}
      onFocus={() => {
        if (!suppressFocusOpen.current && !mouseFocus.current) showReactions();
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        suppressFocusOpen.current = false;
        mouseFocus.current = false;
        cancelHover();
        setOpen(false);
      }}
    >
      <div
        className={`absolute bottom-0 z-10 w-10 overflow-hidden rounded-full border border-border-subtle bg-card-bg p-px shadow-md transition-transform motion-reduce:transition-none ${isOwn ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"} ${open ? "scale-100" : "scale-[0.6]"}`}
        data-workspace-message-quick-reactions="true"
        data-expanded={open ? "true" : "false"}
        style={{ maxHeight: open ? capsuleHeight : 40 }}
      >
        <div
          ref={scrollRef}
          className="flex flex-col items-center overflow-y-auto overscroll-contain scrollbar-none"
          data-workspace-message-quick-reaction-scroll="true"
          style={{ maxHeight: open ? capsuleHeight - 4 : 36 }}
        >
          {(open ? reactions : reactions.slice(0, 1)).map((reaction, index) => (
            <Button
              key={reaction.key}
              ref={(element) => {
                if (index === 0) triggerRef.current = element;
                if (element == null) reactionRefs.current.delete(reaction.key);
                else reactionRefs.current.set(reaction.key, element);
              }}
              type="button"
              size="sm"
              variant="neutral"
              appearance="ghost"
              className="!h-9 !w-9 shrink-0 !rounded-full !px-0 aria-pressed:bg-accent-soft aria-pressed:text-accent"
              aria-label={reaction.label}
              aria-pressed={reaction.pressed}
              aria-expanded={index === 0 ? open : undefined}
              title={reaction.label}
              data-workspace-message-quick-action={index === 0 ? "reaction" : undefined}
              data-workspace-message-quick-reaction={reaction.glyph}
              disabled={reaction.disabled}
              loading={reaction.pending}
              onPointerDown={(event) => {
                mouseFocus.current = event.pointerType === "mouse" && !open;
                if (mouseFocus.current) cancelHover();
                touchPreview.current =
                  event.pointerType === "touch" && !open && reactions.length > 1;
                if (touchPreview.current) showReactions();
              }}
              onPointerCancel={() => {
                touchPreview.current = false;
                mouseFocus.current = false;
              }}
              onKeyDown={(event) => handleReactionKeyDown(event, reaction)}
              onClick={(event) => {
                event.stopPropagation();
                mouseFocus.current = false;
                if (touchPreview.current) {
                  touchPreview.current = false;
                  return;
                }
                closeAndFocusTrigger();
                reaction.onSelect();
              }}
            >
              {reaction.pending ? null : (
                <span aria-hidden="true" className="text-2xl leading-none">
                  {reaction.glyph}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
