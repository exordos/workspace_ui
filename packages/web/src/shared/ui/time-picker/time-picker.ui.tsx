import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { formatTime, parseTime, timePart } from "./time-picker.lib";
import type { TimePickerProps } from "./time-picker.types";
import type { KeyboardEvent } from "react";

function TimeSegment({
  label,
  shortLabel,
  showArrows,
  value,
  max,
  previous,
  next,
  disabled,
  readOnly,
  onSelect,
  onCommit,
}: Readonly<{
  label: string;
  shortLabel: string;
  showArrows: boolean;
  value: number | null;
  max: number;
  previous: number | null;
  next: number | null;
  disabled: boolean;
  readOnly: boolean;
  onSelect: (seconds: number) => void;
  onCommit: (part: number) => void;
}>) {
  const { t } = useTranslation();
  const id = useId();
  const segmentRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ delta: 0, time: 0 });
  const [draft, setDraft] = useState<{ owner: number | null; text: string } | null>(null);
  const display = value == null ? "" : String(value).padStart(2, "0");
  const text = draft?.owner === value ? draft.text : display;
  const commit = () => {
    if (/^\d{1,2}$/u.test(text) && Number(text) <= max && Number(text) !== value)
      onCommit(Number(text));
    setDraft(null);
  };
  const selectStep = (direction: 1 | -1) => {
    if (/^\d{1,2}$/u.test(text) && Number(text) <= max && Number(text) !== value) {
      onCommit(Math.min(max, Math.max(0, Number(text) + direction)));
    } else {
      const target = direction === 1 ? next : previous;
      if (target != null) onSelect(target);
    }
    setDraft(null);
  };
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (
      disabled ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !event.cancelable ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0 ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const gesture = wheelRef.current;
    const delta = event.deltaMode === 0 ? event.deltaY : event.deltaY * 24;
    if (event.timeStamp - gesture.time > 180 || Math.sign(delta) !== Math.sign(gesture.delta))
      gesture.delta = 0;
    gesture.time = event.timeStamp;
    // Accumulate fine trackpad motion; a coarse wheel tick still advances only one step.
    gesture.delta += Math.sign(delta) * Math.min(Math.abs(delta), 24);
    if (Math.abs(gesture.delta) >= 24) {
      selectStep(gesture.delta < 0 ? 1 : -1);
      gesture.delta = 0;
    }
  });
  useEffect(() => {
    if (readOnly) return;
    const segment = segmentRef.current;
    if (segment == null) return;
    const resetWheel = () => {
      wheelRef.current.delta = 0;
    };
    // React wheel handlers are passive; this local listener must also stop page scrolling.
    segment.addEventListener("wheel", handleWheel, { passive: false });
    segment.addEventListener("mouseleave", resetWheel);
    return () => {
      segment.removeEventListener("wheel", handleWheel);
      segment.removeEventListener("mouseleave", resetWheel);
    };
  }, [readOnly]);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      selectStep(event.key === "ArrowUp" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.select();
    } else if (event.key === "Escape" && draft != null) {
      event.stopPropagation();
      event.preventDefault();
      setDraft(null);
    }
  };
  if (readOnly) {
    return (
      <div
        role="group"
        aria-label={label}
        className="min-w-0 rounded-md border-l border-border-subtle pl-1"
      >
        <div className="flex items-baseline justify-center gap-0.5">
          <span className="flex h-8 items-center text-base font-medium tabular-nums">
            {display || "—"}
          </span>
          <span aria-hidden className="text-[10px] leading-none text-text-secondary">
            {shortLabel}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={segmentRef}
      role="group"
      aria-labelledby={`${id}-label`}
      className={`min-w-0 rounded-md border-l border-border-subtle pl-1 ${disabled ? "" : "hover:bg-card-bg/60"}`}
    >
      <label id={`${id}-label`} htmlFor={id} title={label} className="sr-only">
        {label}
      </label>
      <div className="flex items-center justify-center gap-px">
        <div className="flex items-baseline gap-0.5">
          <input
            id={id}
            type="text"
            role="spinbutton"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={text}
            placeholder="—"
            disabled={disabled}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value ?? undefined}
            className="h-8 w-5 min-w-0 rounded-md bg-transparent text-center text-base font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            onFocus={(event) => {
              setDraft({ owner: value, text: display });
              event.currentTarget.select();
            }}
            onChange={(event) =>
              setDraft({ owner: value, text: event.target.value.replace(/\D/gu, "").slice(0, 2) })
            }
            onBlur={commit}
            onKeyDown={handleKeyDown}
          />
          <span
            aria-hidden
            className="pointer-events-none text-[10px] leading-none text-text-secondary"
          >
            {shortLabel}
          </span>
        </div>
        {showArrows ? (
          <div className="flex flex-col">
            {(
              [
                { direction: 1, target: next, icon: "chevron-up" },
                { direction: -1, target: previous, icon: "chevron-down" },
              ] as const
            ).map(({ direction, target, icon }) => (
              <button
                key={direction}
                type="button"
                disabled={disabled || target == null}
                aria-label={t(direction === 1 ? "timePicker.increase" : "timePicker.decrease", {
                  unit: label,
                })}
                data-icon-hover="custom"
                className="flex size-4 items-center justify-center rounded text-text-secondary hover:bg-card-bg-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (target != null) onSelect(target);
                  setDraft(null);
                }}
              >
                <Icon name={icon} size={12} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TimePicker({
  value,
  onValueChange,
  min,
  max,
  showSeconds = false,
  showArrows = true,
  isTimeDisabled,
  disabled = false,
  readOnly = false,
  className = "",
  ...ariaProps
}: Readonly<TimePickerProps>) {
  const { t } = useTranslation();
  const precision = showSeconds ? 1 : 60;
  const parsed = parseTime(value);
  const selected = parsed == null ? null : Math.floor(parsed / precision) * precision;
  const lower = Math.ceil((min == null ? 0 : (parseTime(min) ?? Infinity)) / precision) * precision;
  const upper =
    Math.floor((max == null ? 86399 : (parseTime(max) ?? -Infinity)) / precision) * precision;
  const unavailable = disabled || lower > upper;
  const base = selected ?? (Number.isFinite(lower) ? lower : 0);
  const allowed = (time: number) =>
    time >= lower && time <= upper && !isTimeDisabled?.(formatTime(time, showSeconds));
  const resolvePart = (part: number, index: number): number | null => {
    const unit = [3600, 60, 1][index] ?? 1;
    const candidate = base + (part - timePart(base, index)) * unit;
    const clamped = Math.min(upper, Math.max(lower, candidate));
    return timePart(clamped, index) === part && allowed(clamped) ? clamped : null;
  };
  const step = (index: number, direction: 1 | -1, maxPart: number): number | null => {
    for (
      let part = timePart(base, index) + (selected == null ? 0 : direction);
      part >= 0 && part <= maxPart;
      part += direction
    ) {
      const candidate = resolvePart(part, index);
      if (candidate != null && (candidate !== selected || selected == null)) return candidate;
    }
    return null;
  };
  const units = [
    { label: t("timePicker.hours"), shortLabel: t("timePicker.hoursShort") },
    { label: t("timePicker.minutes"), shortLabel: t("timePicker.minutesShort") },
    { label: t("timePicker.seconds"), shortLabel: t("timePicker.secondsShort") },
  ];
  const emptyTime = showSeconds ? "—:—:—" : "—:—";
  return (
    <div
      {...ariaProps}
      role="group"
      aria-label={
        ariaProps["aria-label"] ??
        (ariaProps["aria-labelledby"] == null ? t("timePicker.label") : undefined)
      }
      aria-disabled={readOnly ? undefined : unavailable || undefined}
      className={`w-[371px] max-w-full rounded-xl border border-border-subtle bg-bg-elevated p-5 text-text-primary ${className}`.trim()}
    >
      <div
        className={`grid items-center gap-1 ${showSeconds ? "grid-cols-[1.4fr_1fr_1fr_1fr]" : "grid-cols-[1.4fr_1fr_1fr]"}`}
      >
        <div className="min-w-0">
          <output
            className="flex h-8 items-center whitespace-nowrap text-base font-medium tabular-nums"
            aria-live={readOnly ? undefined : "polite"}
          >
            {selected == null ? emptyTime : formatTime(selected, showSeconds)}
          </output>
        </div>
        {units.slice(0, showSeconds ? 3 : 2).map(({ label, shortLabel }, index) => (
          <TimeSegment
            key={index}
            label={label}
            shortLabel={shortLabel}
            showArrows={showArrows}
            value={selected == null ? null : timePart(selected, index)}
            max={index === 0 ? 23 : 59}
            previous={step(index, -1, index === 0 ? 23 : 59)}
            next={step(index, 1, index === 0 ? 23 : 59)}
            disabled={unavailable}
            readOnly={readOnly}
            onSelect={(time) => onValueChange(formatTime(time, showSeconds))}
            onCommit={(part) => {
              const next = resolvePart(part, index);
              if (next != null) onValueChange(formatTime(next, showSeconds));
            }}
          />
        ))}
      </div>
    </div>
  );
}
