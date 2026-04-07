// Этот файл централизует инвариантную настройку iframe для встроенного Jitsi.
// Он отвечает только за постоянные разрешения и размеры embed-окна.
// Используется при инициализации звонка, чтобы shell-состояние не влияло на lifecycle Jitsi.

// Этот policy даёт iframe только те capability, которые нужны звонку: камера, микрофон,
// fullscreen и захват экрана. Значение едино для всей сессии звонка.
export const JITSI_IFRAME_ALLOW_POLICY = "camera; microphone; fullscreen; display-capture";

// Настраивает iframe один раз инвариантным образом.
// Функция не зависит от minimized/expanded состояния, чтобы изменения оболочки модалки
// не выглядели для Jitsi как новый session lifecycle.
export function configureJitsiIframe(iframeElement: HTMLElement | null): void {
  if (!iframeElement || !("style" in iframeElement)) return;
  iframeElement.style.width = "100%";
  iframeElement.style.height = "100%";
  iframeElement.style.minHeight = "0";
  iframeElement.setAttribute("allow", JITSI_IFRAME_ALLOW_POLICY);
}
