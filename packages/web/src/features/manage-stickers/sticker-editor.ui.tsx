import { useEffect, useState } from "react";
import { StickerMedia } from "~/entities/sticker/sticker-media.ui";
import {
  stickerFromDto,
  stickerRequestOptions,
  stickerRuntimeKey,
} from "~/entities/sticker/sticker-workspace.repository";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import { t } from "~/i18n/i18n";
import {
  getSticker,
  getStickersPage,
  deleteSticker,
  updateSticker,
  isValidStickerUpdate,
} from "~/shared/api/messenger-stickers.api";
import type { WorkspaceStickerDto, StickerUpdateBody } from "~/shared/api/messenger-stickers.api";
import { isWorkspaceUuid } from "~/shared/lib/workspace-reference-urn.lib";
import { DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { useStickerAdminRequest } from "./sticker-admin-request.hook";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-border-subtle bg-card-bg px-3 py-2 text-sm";
export function StickerEditor({
  initialId,
  active,
  onBusyChange,
  onDirtyChange,
}: Readonly<{
  initialId?: string;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}>) {
  const [selected, setSelected] = useState<WorkspaceStickerDto | null>(null);
  const [id, setId] = useState(initialId ?? "");
  const { run, busy, error } = useStickerAdminRequest();
  async function load(idToLoad: string) {
    const card = await run((signal) => getSticker(stickerRequestOptions(signal), idToLoad.trim()));
    if (card) setSelected(card);
  }
  useEffect(() => {
    if (!initialId) return;
    void run((signal) => getSticker(stickerRequestOptions(signal), initialId)).then((card) => {
      if (card) setSelected(card);
    });
  }, [initialId, run]);
  if (selected)
    return (
      <StickerEditForm
        key={selected.id}
        card={selected}
        onDirtyChange={onDirtyChange}
        onBusyChange={onBusyChange}
        onBack={() => setSelected(null)}
      />
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{t("sticker.chooseHelp")}</p>
      <StickerAdminCatalog active={active} disabled={busy} onSelect={setSelected} />
      <details
        className="rounded-lg border border-border-subtle p-3 text-sm"
        open={Boolean(initialId)}
      >
        <summary className="cursor-pointer font-medium">{t("sticker.findById")}</summary>
        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1">
            {t("sticker.uuid")}
            <input
              className={fieldClass}
              value={id}
              onChange={(event) => setId(event.target.value)}
            />
          </label>
          <DialogPrimaryButton
            disabled={!isWorkspaceUuid(id.trim())}
            isSubmitting={busy}
            onClick={() => void load(id)}
          >
            {t("sticker.loadCard")}
          </DialogPrimaryButton>
        </div>
        <p className="mt-2 text-text-muted">{t("sticker.uuidHelp")}</p>
        {error && (
          <p role="alert" className="mt-2">
            {error}
          </p>
        )}
      </details>
    </div>
  );
}
function StickerAdminCatalog({
  active,
  disabled,
  onSelect,
}: Readonly<{
  active: boolean;
  disabled: boolean;
  onSelect: (card: WorkspaceStickerDto) => void;
}>) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<WorkspaceStickerDto[]>([]);
  const [marker, setMarker] = useState<string | null>(null);
  const [pageMarker, setPageMarker] = useState<string | undefined>();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const owner = stickerRuntimeKey();
    const loadPage = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const page = await getStickersPage(stickerRequestOptions(controller.signal), {
          q,
          pageMarker,
          pageLimit: 24,
        });
        if (controller.signal.aborted || owner !== stickerRuntimeKey()) return;
        setCards((previous) => mergeCards(pageMarker ? previous : [], page.items));
        setMarker(
          page.nextPageMarker && page.nextPageMarker === pageMarker ? null : page.nextPageMarker,
        );
      } catch {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) setFailed(true);
      } finally {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void loadPage(), q ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, q, pageMarker, retry]);
  return (
    <div className="space-y-3">
      <input
        className={fieldClass}
        aria-label={t("sticker.searchAriaLabel")}
        placeholder={t("sticker.searchPlaceholder")}
        maxLength={200}
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setPageMarker(undefined);
          setCards([]);
          setMarker(null);
        }}
      />
      {loading && (
        <p role="status" className="text-sm">
          {t("sticker.loading")}
        </p>
      )}
      {failed && (
        <p role="alert">
          {t("sticker.loadError")}{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {t("sticker.retryLoad")}
          </button>
        </p>
      )}
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
        {cards.map((card) => (
          <button
            type="button"
            key={card.id}
            disabled={disabled}
            onClick={() => onSelect(card)}
            className="rounded-xl border border-border-subtle p-2 text-left hover:bg-card-bg"
          >
            <StickerMedia
              sticker={stickerFromDto(card)}
              className="flex h-20 items-center justify-center"
            />
            <span className="mt-2 block truncate text-xs">{card.title}</span>
          </button>
        ))}
      </div>
      {!loading && !failed && cards.length === 0 && (
        <p className="py-4 text-center text-sm text-text-muted">{t("sticker.noSearchResults")}</p>
      )}
      {marker && (
        <button
          type="button"
          disabled={loading}
          onClick={() => setPageMarker(marker)}
          className="w-full rounded-lg border border-border-subtle p-2 text-sm"
        >
          {t("sticker.loadMore")}
        </button>
      )}
    </div>
  );
}
function StickerEditForm({
  card,
  onBusyChange,
  onBack,
  onDirtyChange,
}: Readonly<{
  card: WorkspaceStickerDto;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onBack: () => void;
}>) {
  const [current, setCurrent] = useState(card);
  const [body, setBody] = useState<StickerUpdateBody>({});
  const [saved, setSaved] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, busy, error } = useStickerAdminRequest();
  const dirty = Object.keys(body).length > 0;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const change = (patch: StickerUpdateBody) => {
    setSaved(false);
    setBody((old) => ({ ...old, ...patch }));
  };
  const patch = {
    ...body,
    ...(body.tags ? { tags: body.tags.map((s) => s.trim()).filter(Boolean) } : {}),
    ...(body.emoji ? { emoji: body.emoji.map((s) => s.trim()).filter(Boolean) } : {}),
  };
  async function save() {
    onBusyChange(true);
    try {
      const result = await run((signal) =>
        updateSticker(stickerRequestOptions(signal), current.id, patch),
      );
      if (result) {
        setCurrent(result);
        setBody({});
        setSaved(true);
        void useStickerStore.getState().refresh();
      }
    } finally {
      onBusyChange(false);
    }
  }
  async function remove() {
    onBusyChange(true);
    try {
      const deleted = await run(async (signal) => {
        await deleteSticker(stickerRequestOptions(signal), current.id);
        return true;
      });
      if (deleted) {
        onDirtyChange(false);
        void useStickerStore.getState().refresh();
        onBack();
      }
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <div className="space-y-5">
      <button
        type="button"
        disabled={busy}
        className="text-sm text-accent"
        onClick={() => {
          if (Object.keys(body).length) setConfirmBack(true);
          else onBack();
        }}
      >
        {t("sticker.chooseAnother")}
      </button>
      {confirmBack && (
        <div role="alert" className="rounded-lg border border-border-subtle p-3 text-sm">
          <p>{t("sticker.discardHelp")}</p>
          <button type="button" className="mr-4 mt-2 text-accent" disabled={busy} onClick={onBack}>
            {t("sticker.discard")}
          </button>
          <button type="button" onClick={() => setConfirmBack(false)}>
            {t("sticker.keepEditing")}
          </button>
        </div>
      )}
      <div className="flex items-center gap-4 rounded-xl bg-card-bg p-4">
        <StickerMedia
          sticker={stickerFromDto(current)}
          className="flex h-24 w-24 shrink-0 items-center justify-center"
        />
        <div className="min-w-0">
          <p className="font-medium">{body.title ?? current.title}</p>
          <p className="mt-1 break-all text-xs text-text-muted">{current.id}</p>
        </div>
      </div>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          {t("sticker.title")}
          <input
            className={fieldClass}
            maxLength={200}
            value={body.title ?? current.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          {t("sticker.alt")}
          <input
            className={fieldClass}
            maxLength={500}
            value={body.alt_text ?? current.alt_text}
            onChange={(e) => change({ alt_text: e.target.value })}
          />
          <span className="mt-1 block text-xs text-text-muted">{t("sticker.altHelp")}</span>
        </label>
        <label className="block text-sm">
          {t("sticker.category")}
          <select
            className={fieldClass}
            value={body.category ?? current.category}
            onChange={(e) => change({ category: e.target.value === "gif" ? "gif" : "sticker" })}
          >
            <option value="gif">GIF</option>
            <option value="sticker">{t("sticker.stickers")}</option>
          </select>
        </label>
        <details className="rounded-lg border border-border-subtle p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("sticker.searchMetadata")}
          </summary>
          <p className="my-3 text-xs text-text-muted">{t("sticker.metadataHelp")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              {t("sticker.tags")}
              <textarea
                rows={3}
                className={fieldClass}
                value={(body.tags ?? current.tags).join("\n")}
                onChange={(e) => change({ tags: e.target.value.split("\n") })}
              />
            </label>
            <label className="text-sm">
              {t("sticker.emoji")}
              <textarea
                rows={3}
                className={fieldClass}
                value={(body.emoji ?? current.emoji).join("\n")}
                onChange={(e) => change({ emoji: e.target.value.split("\n") })}
              />
            </label>
          </div>
        </details>
      </fieldset>
      {Object.keys(body).length > 0 && !isValidStickerUpdate(patch) && (
        <p role="alert" className="text-sm">
          {t("sticker.invalidMetadata")}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{t("sticker.saved")}</p>}
      {confirmDelete && (
        <p role="alert" className="border-danger/30 bg-danger/5 rounded-lg border p-3 text-sm">
          {t("sticker.deleteHelp")}
        </p>
      )}
      <div className="sticky bottom-0 flex justify-between gap-3 border-t border-border-subtle bg-bg-elevated py-3">
        {confirmDelete ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-card-bg disabled:opacity-50"
              onClick={() => setConfirmDelete(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="hover:bg-danger/90 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void remove()}
            >
              {busy ? t("sticker.deleting") : t("sticker.deleteConfirm")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              className="border-danger/30 hover:bg-danger/10 rounded-lg border px-3 py-2 text-sm text-danger disabled:opacity-50"
              onClick={() => setConfirmDelete(true)}
            >
              {t("sticker.deleteAction")}
            </button>
            <DialogPrimaryButton
              disabled={!isValidStickerUpdate(patch)}
              isSubmitting={busy}
              onClick={() => void save()}
            >
              {t("sticker.save")}
            </DialogPrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

function mergeCards(previous: WorkspaceStickerDto[], incoming: WorkspaceStickerDto[]) {
  return [...new Map([...previous, ...incoming].map((card) => [card.id, card])).values()];
}
