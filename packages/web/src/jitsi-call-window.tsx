import { createRoot } from "react-dom/client";
import { JitsiCallWindow } from "~/features/jitsi-call/jitsi-call-window.ui";
import { setLocale, t } from "~/i18n/i18n";
import { brand } from "~/shared/lib/brand";
import { applyTheme } from "~/shared/lib/themes/engine";
import { defaultPaletteId } from "~/shared/lib/themes/registry";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import "./app/app.styles.css";
import "./app/focus-outline.styles.css";

function renderCallWindow(
  container: HTMLElement,
  call: JitsiCallWindowPayload,
  bridge: JitsiCallWindowRendererBridge,
) {
  setLocale(call.language);
  applyTheme(call.theme?.paletteId ?? defaultPaletteId, call.theme?.mode ?? "system");
  initVisibilityTracking();
  document.title = `${t("call.call")} · ${brand.appName}`;
  createRoot(container).render(<JitsiCallWindow call={call} bridge={bridge} />);
}

async function mountJitsiCallWindow() {
  const bridge = window.jitsiCallWindow;
  const container = document.getElementById("root");
  if (container == null) return;

  const call = await bridge?.getPayload().catch(() => null);
  if (call == null || bridge == null) {
    createRoot(container).render(
      <p className="grid h-full place-items-center text-notice-base" role="alert">
        {t("call.apiLoadFailed")}
      </p>,
    );
    return;
  }

  renderCallWindow(container, call, bridge);
}

void mountJitsiCallWindow();
