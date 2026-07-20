import type { Config } from "tailwindcss";
import scrollbar from "tailwind-scrollbar";
import { CHAT_PAGE_MIN_WIDTH_PX } from "./src/shared/config/layout-widths.constants";

const colorVar = (name: string) => `var(--color-${name})`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* Surfaces */
        bg: colorVar("bg"),
        "bg-elevated": colorVar("bg-elevated"),
        "card-bg": colorVar("card-bg"),
        "card-bg-active": colorVar("card-bg-active"),
        "text-field-bg": colorVar("text-field-bg"),

        /* Typography */
        "text-primary": colorVar("text-primary"),
        "text-secondary": colorVar("text-secondary"),
        "text-muted": colorVar("text-muted"),

        /* Brand */
        accent: colorVar("accent"),
        "accent-soft": colorVar("accent-soft"),
        "on-accent": colorVar("on-accent"),

        /* Borders */
        "border-subtle": colorVar("border-subtle"),

        /* Sidebar */
        "sidebar-bg": colorVar("sidebar-bg"),
        "sidebar-hover": colorVar("sidebar-item-hover"),
        "sidebar-sender": colorVar("sidebar-sender"),
        "sidebar-unread": colorVar("sidebar-unread"),

        /* Composer */
        "composer-outer": colorVar("composer-outer"),
        "composer-send": colorVar("composer-send"),
        "composer-icon": colorVar("composer-icon"),

        /* Messages */
        "msg-bg": colorVar("msg-bg"),
        "msg-own-bg": colorVar("msg-own-bg"),
        "msg-time": colorVar("msg-time"),
        "msg-call-bg": colorVar("msg-call-bg"),
        "msg-selected": colorVar("msg-selected"),

        /* Icons */
        "icon-base": colorVar("icon-base"),
        "icon-disable": colorVar("icon-disable"),
        "icon-hover": colorVar("icon-hover"),
        "icon-active": colorVar("icon-active"),

        /* Notice / Badges */
        "notice-base": colorVar("notice-base"),
        "notice-disable": colorVar("notice-disable"),
        "badge-bg": colorVar("badge-bg"),
        "badge-text": colorVar("badge-text"),

        /* Call */
        "call-bg": colorVar("call-bg"),
        "call-green": colorVar("call-green"),
        "call-red": colorVar("call-red"),

        /* Search */
        "search-bg": colorVar("search-bg"),

        /* Indicators */
        "indicator-yellow": colorVar("indicator-yellow"),
        "indicator-pink": colorVar("indicator-pink"),
        "indicator-purple": colorVar("indicator-purple"),
        "indicator-green": colorVar("indicator-green"),
        "indicator-orange": colorVar("indicator-orange"),
      },
      spacing: {
        sidebar: "299px",
        header: "123px",
        "panel-right": "299px",
      },
      /* Mirror layout constants in `src/shared/config/constants.ts` (main / narrow / shell min). */
      maxWidth: {
        "main-workspace": "1920px",
        "narrow-page": "1199px",
        "modal-manage-folder": "520px",
        "drawer-profile": "360px",
      },
      minWidth: {
        "app-shell-min": "360px",
        "chat-page": `${CHAT_PAGE_MIN_WIDTH_PX}px`,
        "context-menu": "160px",
        "context-menu-message": "200px",
        "context-menu-wide": "220px",
        "context-menu-narrow": "180px",
      },
      width: {
        "folder-quick-list": "260px",
      },
      minHeight: {
        "app-shell": "400px",
      },
      borderRadius: {
        lg: "6px",
        xl: "10px",
        "2xl": "12px",
        bubble: "18px",
      },
      zIndex: {
        base: "0",
        sticky: "10",
        float: "20",
        dropdown: "30",
        overlay: "40",
        modal: "50",
        toast: "60",
        pip: "70",
        max: "9999",
      },
    },
  },
  plugins: [scrollbar({ nocompatible: true })],
} satisfies Config;
