// Общий helper для программной прокрутки списков вниз.
// Нужен, чтобы централизованно различать мгновенный автоскролл и плавный скролл по клику на кнопку.
export type ScrollToBottomBehavior = "instant" | "smooth";

// Проверяет системную настройку уменьшения анимации.
// Если пользователь отключил motion-эффекты, плавную прокрутку нужно деградировать до мгновенной.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Нормализует режим прокрутки перед вызовом DOM API.
// Это защищает от лишней анимации в accessibility-сценариях.
function resolveScrollBehavior(behavior: ScrollToBottomBehavior): ScrollToBottomBehavior {
  if (behavior === "smooth" && prefersReducedMotion()) {
    return "instant";
  }

  return behavior;
}

// Прокручивает контейнер к самому низу.
// По умолчанию используется мгновенный режим для автоскроллов,
// а плавный режим передаётся явно только для пользовательской кнопки "вниз".
export function scrollToBottom(
  el: HTMLElement | null,
  behavior: ScrollToBottomBehavior = "instant",
): void {
  if (!el) return;

  el.scrollTo({
    top: el.scrollHeight,
    behavior: resolveScrollBehavior(behavior),
  });
}
