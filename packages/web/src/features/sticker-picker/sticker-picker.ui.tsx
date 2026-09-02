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
 * The owning messenger flow sends it immediately as a separate message.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { Sticker, StickerPack } from "~/entities/sticker/sticker.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
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
    aria-label={sticker.alt}
    title={sticker.emoji.join(" ")}
  >
    <img
      src={sticker.thumbnailUrl ?? sticker.url}
      alt={sticker.alt}
      className="max-h-full max-w-full object-contain"
      loading="lazy"
      draggable={false}
    />
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
        <span className="text-lg">{pack.stickers[0]?.emoji[0] ?? "📦"}</span>
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

const StickerLoadingState: React.FC = () => (
  <div
    className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted"
    role="status"
  >
    {t("sticker.loading")}
  </div>
);

const StickerLoadErrorState: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div
    className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    role="alert"
  >
    <p className="text-sm text-notice-base">{t("sticker.loadError")}</p>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
    >
      {t("sticker.retryLoad")}
    </button>
  </div>
);

interface StickerPickerContentProps {
  activePackId: string;
  displayStickers: readonly Sticker[];
  error: string | null;
  hasRecent: boolean;
  isSearchActive: boolean;
  loading: boolean;
  packs: readonly StickerPack[];
  onRetry: () => void;
  onSelectPack: (packId: string) => void;
  onSelectSticker: (sticker: Sticker) => void;
}

const StickerPickerContent: React.FC<StickerPickerContentProps> = ({
  activePackId,
  displayStickers,
  error,
  hasRecent,
  isSearchActive,
  loading,
  packs,
  onRetry,
  onSelectPack,
  onSelectSticker,
}) => {
  if (loading) return <StickerLoadingState />;
  if (error != null) return <StickerLoadErrorState onRetry={onRetry} />;
  if (!isSearchActive && packs.length === 0 && !hasRecent) return <EmptyState />;

  const emptyMessage =
    activePackId === "search" ? t("sticker.noSearchResults") : t("sticker.noRecentStickers");

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1.5 scrollbar-none">
        <button
          type="button"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
            activePackId === "recent"
              ? "bg-accent/20 ring-1 ring-accent"
              : "hover:bg-card-bg-active"
          }`}
          onClick={() => onSelectPack("recent")}
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
            onClick={() => onSelectPack(pack.id)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {displayStickers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {emptyMessage}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {displayStickers.map((sticker) => (
              <StickerItem key={sticker.id} sticker={sticker} onClick={onSelectSticker} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

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
  const stickerLoading = useStickerStore((s) => s.loading);
  const stickerError = useStickerStore((s) => s.error);
  const searchResults = useStickerStore((s) => s.searchResults);
  const sessionStickers = useStickerStore((s) => s.sessionStickers);
  const searchLoading = useStickerStore((s) => s.searchLoading);
  const searchError = useStickerStore((s) => s.searchError);
  const loadCatalog = useStickerStore((s) => s.loadCatalog);
  const searchCatalog = useStickerStore((s) => s.searchCatalog);
  const clearSearch = useStickerStore((s) => s.clearSearch);
  const addRecent = useStickerStore((s) => s.addRecent);

  const [activePackId, setActivePackId] = useState<string>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [completedSearchQuery, setCompletedSearchQuery] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialPackSelectedRef = useRef(false);
  const userSelectedViewRef = useRef(false);

  useEffect(() => {
    const stickerState = useStickerStore.getState();
    if (stickerState.packs.length > 0 || stickerState.loading || stickerState.error != null) return;

    // The catalog is app-global public data, so loading may outlive this picker instance.
    void loadCatalog();
  }, [loadCatalog]);

  const recentStickers = useMemo(() => {
    const stickerById = new Map<string, Sticker>();
    for (const pack of packs) {
      for (const sticker of pack.stickers) {
        stickerById.set(sticker.id, sticker);
      }
    }
    for (const sticker of sessionStickers) {
      stickerById.set(sticker.id, sticker);
    }

    return recent
      .map((entry) => stickerById.get(entry.stickerId))
      .filter((sticker): sticker is Sticker => sticker != null);
  }, [packs, recent, sessionStickers]);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length === 0) {
      clearSearch();
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void searchCatalog(normalizedQuery, controller.signal).finally(() => {
        if (controller.signal.aborted) return;
        setCompletedSearchQuery(normalizedQuery);
      });
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [clearSearch, searchCatalog, searchQuery]);

  useEffect(() => {
    const firstPackId = packs[0]?.id;
    if (initialPackSelectedRef.current || firstPackId == null) return;

    initialPackSelectedRef.current = true;
    if (
      recentStickers.length === 0 &&
      !userSelectedViewRef.current &&
      activePackId === "recent" &&
      searchQuery.trim().length === 0
    ) {
      setActivePackId(firstPackId);
    }
  }, [activePackId, packs, recentStickers.length, searchQuery]);

  const activePack = packs.find((p) => p.id === activePackId);

  const displayStickers = useMemo((): Sticker[] => {
    if (activePackId === "search") {
      return completedSearchQuery === searchQuery.trim() ? searchResults : [];
    }
    if (activePackId === "recent") return recentStickers;
    return activePack?.stickers ?? [];
  }, [activePackId, activePack, completedSearchQuery, recentStickers, searchQuery, searchResults]);

  const handleSelect = (sticker: Sticker) => {
    addRecent(sticker);
    onSelect(sticker);
  };

  const handleSearchChange = (value: string) => {
    userSelectedViewRef.current = true;
    setCompletedSearchQuery(null);
    setSearchQuery(value);
    if (value.trim()) {
      setActivePackId("search");
    } else {
      setActivePackId("recent");
    }
  };

  const handleRetryLoad = () => {
    const normalizedQuery = searchQuery.trim();
    if (activePackId === "search" && normalizedQuery.length > 0) {
      void searchCatalog(normalizedQuery);
      return;
    }
    void loadCatalog();
  };

  const handleSelectPack = (packId: string) => {
    userSelectedViewRef.current = true;
    setActivePackId(packId);
    setSearchQuery("");
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
        <SearchInput
          ref={searchRef}
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={t("sticker.searchPlaceholder")}
          ariaLabel={t("sticker.searchAriaLabel")}
          className="flex-1 border-0 bg-transparent px-0 py-0 focus-within:border-transparent"
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

      <StickerPickerContent
        activePackId={activePackId}
        displayStickers={displayStickers}
        error={activePackId === "search" ? searchError : stickerError}
        hasRecent={recentStickers.length > 0}
        isSearchActive={activePackId === "search"}
        loading={
          activePackId === "search"
            ? completedSearchQuery !== searchQuery.trim() || searchLoading
            : stickerLoading
        }
        packs={packs}
        onRetry={handleRetryLoad}
        onSelectPack={handleSelectPack}
        onSelectSticker={handleSelect}
      />
      <a
        href="https://giphy.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 border-t border-border-subtle px-3 py-2 text-center text-xs font-semibold text-text-secondary underline decoration-text-muted underline-offset-2 hover:text-text-primary"
      >
        {t("sticker.poweredByGiphy")}
      </a>
    </div>
  );
};
