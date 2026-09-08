import React, { useEffect, useState } from "react";
import { StickerMedia } from "~/entities/sticker/sticker-media.ui";
import { stickerRuntimeKey } from "~/entities/sticker/sticker-workspace.repository";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import type { StickerCategory } from "~/shared/api/messenger-stickers.api";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
import type { StickerPickerProps } from "./sticker-picker.types";

export const StickerPicker: React.FC<StickerPickerProps> = ({
  onSelect,
  onClose,
  embedded = false,
  adminAction,
}) => {
  const owner = useWorkspaceAuthStore(() => stickerRuntimeKey());
  return (
    <WorkspaceStickerPicker
      key={owner}
      onSelect={onSelect}
      onClose={onClose}
      embedded={embedded}
      adminAction={adminAction}
    />
  );
};
function WorkspaceStickerPicker({
  onSelect,
  onClose,
  embedded,
  adminAction,
}: Readonly<StickerPickerProps>) {
  const items = useStickerStore((s) => s.items);
  const loading = useStickerStore((s) => s.loading);
  const error = useStickerStore((s) => s.error);
  const mutationError = useStickerStore((s) => s.mutationError);
  const pending = useStickerStore((s) => s.pendingFavorites);
  const next = useStickerStore((s) => s.nextPageMarker);
  const load = useStickerStore((s) => s.loadCatalog);
  const cancelLoad = useStickerStore((s) => s.cancelLoad);
  const query = useStickerStore((s) => s.query);
  const loadMore = useStickerStore((s) => s.loadMore);
  const toggle = useStickerStore((s) => s.toggleFavorite);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<StickerCategory | undefined>();
  const [favorite, setFavorite] = useState(false);
  const [settledQuery, setSettledQuery] = useState("");
  const validQuery = Array.from(q.trim()).length <= 200;
  useEffect(() => {
    cancelLoad();
    if (!validQuery) return;
    const timeout = window.setTimeout(
      () => {
        setSettledQuery(q);
        void load({ q, category, favorite: favorite || undefined });
      },
      q ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timeout);
      cancelLoad();
    };
  }, [q, category, favorite, load, validQuery, cancelLoad]);
  const waiting =
    q !== settledQuery || query.category !== category || Boolean(query.favorite) !== favorite;
  return (
    <div
      className={`flex flex-col overflow-hidden bg-bg-elevated ${embedded ? "h-[320px] w-full" : "h-[420px] w-[340px] rounded-xl border border-border-subtle shadow-lg"}`}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={t("sticker.searchPlaceholder")}
          ariaLabel={t("sticker.searchAriaLabel")}
          className="flex-1"
        />
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="flex gap-2 border-b border-border-subtle p-2 text-xs">
        <button type="button" aria-pressed={!favorite} onClick={() => setFavorite(false)}>
          {t("sticker.all")}
        </button>
        <button type="button" aria-pressed={favorite} onClick={() => setFavorite(true)}>
          {t("sticker.favorites")}
        </button>
        <select
          aria-label={t("sticker.category")}
          value={category ?? ""}
          onChange={(e) =>
            setCategory(
              e.target.value === "gif" || e.target.value === "sticker" ? e.target.value : undefined,
            )
          }
        >
          <option value="">{t("sticker.allCategories")}</option>
          <option value="gif">GIF</option>
          <option value="sticker">{t("sticker.stickers")}</option>
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!validQuery ? (
          <p role="alert">{t("sticker.queryTooLong")}</p>
        ) : (
          <>
            {(loading || waiting) && <p role="status">{t("sticker.loading")}</p>}
            {error && (
              <div role="alert">
                {t("sticker.loadError")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    void (next
                      ? loadMore()
                      : load({ q, category, favorite: favorite || undefined }));
                  }}
                >
                  {t("sticker.retryLoad")}
                </button>
              </div>
            )}
            {mutationError && <p role="alert">{t("sticker.favoriteError")}</p>}
            {!waiting && (
              <div className="grid grid-cols-4 gap-1">
                {items.map((sticker) => (
                  <div key={sticker.id} className="relative">
                    <button
                      type="button"
                      className="flex h-20 w-full items-center justify-center rounded-lg p-1 hover:bg-card-bg-active"
                      aria-label={sticker.alt || sticker.title}
                      onClick={() => onSelect(sticker)}
                    >
                      <StickerMedia
                        sticker={sticker}
                        className="flex h-full w-full items-center justify-center"
                      />
                    </button>
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 rounded bg-bg-elevated px-1"
                      aria-label={sticker.isFavorite ? t("sticker.unstar") : t("sticker.star")}
                      aria-pressed={sticker.isFavorite ?? false}
                      disabled={pending.includes(sticker.id)}
                      onClick={() => {
                        void toggle(sticker);
                      }}
                    >
                      {sticker.isFavorite ? "★" : "☆"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!loading && !waiting && !error && items.length === 0 && (
              <p className="p-6 text-center text-sm text-text-muted">
                {t("sticker.noSearchResults")}
              </p>
            )}
            {next && !waiting && (
              <button
                type="button"
                className="w-full p-2 text-sm"
                disabled={loading}
                onClick={() => {
                  void loadMore();
                }}
              >
                {t("sticker.loadMore")}
              </button>
            )}
          </>
        )}
      </div>
      {adminAction}
    </div>
  );
}
