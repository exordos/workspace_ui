/**
 * StickerPicker — Telegram-style sticker selection panel.
 *
 * Opened from the composer toolbar. Shows:
 * 1. Recent stickers (top row)
 * 2. Pack tabs (horizontal scrollable)
 * 3. Sticker grid for selected pack
 * 4. Search by emoji/keyword
 *
 * When a sticker is selected, fires `onSelect` with the Sticker object.
 * The composer converts it to markdown via `buildStickerMarkdown()`.
 */
import React, { useState, useMemo, useRef } from "react";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { Sticker } from "~/entities/sticker/sticker.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { PackTabProps, StickerItemProps, StickerPickerProps } from "./sticker-picker.types";

// ---------------------------------------------------------------------------
// Sticker grid item
// ---------------------------------------------------------------------------

const StickerItem: React.FC<StickerItemProps> = ({ sticker, size = 80, onClick }) => (
  <button
    type="button"
    className="group relative flex items-center justify-center rounded-lg p-1 transition-colors hover:bg-card-bg-active"
    style={{ width: size, height: size }}
    onClick={() => onClick(sticker)}
    aria-label={sticker.alt ?? sticker.emoji}
    title={sticker.emoji}
  >
    {sticker.format === "lottie" ? (
      <div
        className="flex items-center justify-center text-4xl"
        style={{ width: size - 16, height: size - 16 }}
      >
        {sticker.emoji}
      </div>
    ) : (
      <img
        src={sticker.thumbnailUrl ?? sticker.url}
        alt={sticker.alt ?? sticker.emoji}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        draggable={false}
      />
    )}
  </button>
);

// ---------------------------------------------------------------------------
// Pack tab
// ---------------------------------------------------------------------------

const PackTab: React.FC<PackTabProps> = ({ pack, isActive, onClick }) => {
  const coverSticker = pack.stickers.find((s) => s.id === pack.coverStickerId) ?? pack.stickers[0];
  return (
    <button
      type="button"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
        isActive ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-card-bg-active"
      }`}
      onClick={onClick}
      title={pack.title}
      aria-label={pack.title}
      data-roving-item
    >
      {coverSticker ? (
        <img
          src={coverSticker.thumbnailUrl ?? coverSticker.url}
          alt={pack.title}
          className="h-7 w-7 object-contain"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="text-lg">{pack.stickers[0]?.emoji ?? "📦"}</span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyState: React.FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-text-muted">
    <span className="text-4xl">🎨</span>
    <p className="text-center text-sm">{t("sticker.emptyState")}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const StickerPicker: React.FC<StickerPickerProps> = ({
  onSelect,
  onClose,
  embedded = false,
}) => {
  const packs = useStickerStore((s) => s.packs);
  const recent = useStickerStore((s) => s.recent);
  const addRecent = useStickerStore((s) => s.addRecent);
  const searchByEmoji = useStickerStore((s) => s.searchByEmoji);

  const [activePackId, setActivePackId] = useState<string>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const recentStickers = useMemo(() => {
    const stickerById = new Map<string, Sticker>();
    for (const pack of packs) {
      for (const sticker of pack.stickers) {
        stickerById.set(sticker.id, sticker);
      }
    }

    return recent
      .map((entry) => stickerById.get(entry.stickerId))
      .filter((sticker): sticker is Sticker => sticker != null);
  }, [packs, recent]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchByEmoji(searchQuery.trim());
  }, [searchQuery, searchByEmoji]);

  const activePack = packs.find((p) => p.id === activePackId);

  const displayStickers = useMemo((): Sticker[] => {
    if (activePackId === "search") return searchResults;
    if (activePackId === "recent") return recentStickers;
    return activePack?.stickers ?? [];
  }, [activePackId, activePack, recentStickers, searchResults]);

  const handleSelect = (sticker: Sticker) => {
    addRecent(sticker.id, sticker.packId);
    onSelect(sticker);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim()) {
      setActivePackId("search");
    } else {
      setActivePackId("recent");
    }
  };

  return (
    <div
      className={`flex flex-col overflow-hidden ${
        embedded
          ? "h-[320px] w-full rounded-none border-0 bg-bg-elevated shadow-none"
          : "h-[360px] w-[340px] rounded-xl border border-border-subtle bg-bg-elevated shadow-lg"
      }`}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Icon name="search" size={18} className="shrink-0 text-text-muted" />
        <input
          ref={searchRef}
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={t("sticker.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          aria-label={t("sticker.searchAriaLabel")}
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {packs.length === 0 && !recentStickers.length ? (
        <EmptyState />
      ) : (
        <>
          {/* Pack tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1.5 scrollbar-none">
            <button
              type="button"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                activePackId === "recent"
                  ? "bg-accent/20 ring-1 ring-accent"
                  : "hover:bg-card-bg-active"
              }`}
              onClick={() => {
                setActivePackId("recent");
                setSearchQuery("");
              }}
              title={t("sticker.recent")}
              aria-label={t("sticker.recentAriaLabel")}
              data-roving-item
            >
              <span className="text-lg">🕐</span>
            </button>
            {packs.map((pack) => (
              <PackTab
                key={pack.id}
                pack={pack}
                isActive={activePackId === pack.id}
                onClick={() => {
                  setActivePackId(pack.id);
                  setSearchQuery("");
                }}
              />
            ))}
          </div>

          {/* Sticker grid */}
          <div className="flex-1 overflow-y-auto p-2">
            {displayStickers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                {activePackId === "search"
                  ? t("sticker.noSearchResults")
                  : t("sticker.noRecentStickers")}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {displayStickers.map((sticker) => (
                  <StickerItem key={sticker.id} sticker={sticker} onClick={handleSelect} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
