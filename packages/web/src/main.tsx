import { bypassSpaForBackendPath } from "~/shared/lib/backend-path-bypass";
import { ensureJitsiExternalApiLoaded } from "~/shared/lib/jitsi-external-api.loader";

// Если SPA-оболочка попала на backend-путь (старый SW перехватил navigation
// или балансировщик отдает index.html на `/accounts/...`) — снимаем SW и
// перезагружаемся через сеть. Должно выполниться до загрузки React.
if (!bypassSpaForBackendPath()) {
  await ensureJitsiExternalApiLoaded();
  const { mountApplication } = await import("./main-app");
  mountApplication();
}
