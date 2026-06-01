import { t } from "~/i18n/i18n";
import CheckIconRaw from "~/shared/assets/icons/check.svg?raw";
import CopyIconRaw from "~/shared/assets/icons/copy.svg?raw";
import { writeText } from "~/shared/lib/clipboard";

interface CodeCopyButtonMount {
  button: HTMLButtonElement;
  clickHandler: (event: MouseEvent) => void;
  iconHost: HTMLSpanElement;
  resetTimerId: number | null;
}

const CODE_COPY_ICON_MARKUP = CopyIconRaw;
const CODE_COPY_SUCCESS_ICON_MARKUP = CheckIconRaw;

function setCopyButtonAria(
  copyButton: HTMLButtonElement,
  state: "idle" | "success" | "error",
): void {
  if (state === "success") {
    copyButton.setAttribute("aria-label", t("message.copied"));
    copyButton.setAttribute("title", t("message.copied"));
    return;
  }
  if (state === "error") {
    copyButton.setAttribute("aria-label", t("message.copyFailed"));
    copyButton.setAttribute("title", t("message.copyFailed"));
    return;
  }
  copyButton.setAttribute("aria-label", t("message.copy"));
  copyButton.setAttribute("title", t("message.copy"));
}

function renderCopyIcon(iconHost: HTMLSpanElement, state: "idle" | "success" | "error"): void {
  iconHost.innerHTML = state === "success" ? CODE_COPY_SUCCESS_ICON_MARKUP : CODE_COPY_ICON_MARKUP;
}

function mountCodeCopyButton(codeBlock: HTMLElement): CodeCopyButtonMount | null {
  const preElement = codeBlock.parentElement;
  if (!(preElement instanceof HTMLElement)) {
    return null;
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.dataset.codeCopyButton = "true";
  copyButton.dataset.copyState = "idle";
  copyButton.className =
    "message-code-copy-btn inline-flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated/90 text-composer-icon transition-colors hover:text-icon-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

  const iconHost = document.createElement("span");
  iconHost.className =
    "pointer-events-none inline-flex h-3.5 w-3.5 items-center justify-center text-current [&>svg]:h-full [&>svg]:w-full";
  copyButton.appendChild(iconHost);
  preElement.appendChild(copyButton);

  setCopyButtonAria(copyButton, "idle");
  renderCopyIcon(iconHost, "idle");

  const mount: CodeCopyButtonMount = {
    button: copyButton,
    clickHandler: () => {},
    iconHost,
    resetTimerId: null,
  };

  mount.clickHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const source = codeBlock.textContent ?? "";
    if (source.trim().length === 0) {
      return;
    }

    if (mount.resetTimerId != null) {
      window.clearTimeout(mount.resetTimerId);
      mount.resetTimerId = null;
    }

    void writeText(source).then((ok) => {
      const state = ok ? "success" : "error";
      copyButton.dataset.copyState = state;
      setCopyButtonAria(copyButton, state);
      renderCopyIcon(iconHost, state);
      mount.resetTimerId = window.setTimeout(() => {
        mount.resetTimerId = null;
        copyButton.dataset.copyState = "idle";
        setCopyButtonAria(copyButton, "idle");
        renderCopyIcon(iconHost, "idle");
      }, 1200);
    });
  };

  copyButton.addEventListener("click", mount.clickHandler);
  return mount;
}

export function teardownCodeCopyButtons(mounts: CodeCopyButtonMount[]): void {
  for (const mount of mounts) {
    if (mount.resetTimerId != null) {
      window.clearTimeout(mount.resetTimerId);
    }
    mount.button.removeEventListener("click", mount.clickHandler);
    mount.iconHost.innerHTML = "";
    mount.button.remove();
  }
}

/** Attaches copy buttons to `<pre><code>` blocks inside the message body element. */
export function mountCodeCopyButtons(messageBodyElement: HTMLDivElement): CodeCopyButtonMount[] {
  const mounts: CodeCopyButtonMount[] = [];
  const codeBlocks = messageBodyElement.querySelectorAll<HTMLElement>("pre > code");

  for (const codeBlock of codeBlocks) {
    const mount = mountCodeCopyButton(codeBlock);
    if (mount != null) {
      mounts.push(mount);
    }
  }

  return mounts;
}
