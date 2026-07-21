import type { ThemePalette } from "./tokens";

export const emeraldChat: ThemePalette = {
  id: "emerald-chat",
  name: "Emerald Chat",

  dark: {
    bg: "#1b1b1d",
    "bg-elevated": "#26262a",
    "card-bg": "#373737",
    "card-bg-active": "#4b4b4b",
    "text-field-bg": "#1a2a25",

    "text-primary": "#e9fff5",
    "text-secondary": "#9fb8b0",
    "text-muted": "#7e9890",

    accent: "#2ecf72",
    "accent-soft": "#1e4a39",
    "on-accent": "#0d1714",

    "border-subtle": "#3f3f45",

    "sidebar-bg": "#2c2c2e",
    // Same as card-bg-active — old #38383a disappears on left sidebar card-bg (#373737)
    "sidebar-item-hover": "#4b4b4b",
    "sidebar-sender": "#63e09a",
    "sidebar-unread": "#2ecf72",

    "composer-outer": "#1a2a25",
    "composer-send": "#2ecf72",
    "composer-icon": "#7e9890",

    "msg-bg": "#1f2f2a",
    "msg-own-bg": "#1f4d3e",
    "msg-time": "#97b1a9",
    "msg-call-bg": "#1b4a39",
    "msg-selected": "rgba(46, 207, 114, 0.30)",

    "icon-base": "#7e9890",
    "icon-disable": "#4f6861",
    "icon-hover": "#a9c8bf",
    "icon-active": "#e9fff5",

    "notice-base": "#2ecf72",
    "notice-disable": "#5f7a72",
    "badge-bg": "#2ecf72",
    "badge-text": "#ffffff",

    "call-bg": "#1b4a39",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "rgba(255, 255, 255, 0.08)",
    "search-hint": "#7e9890",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },

  light: {
    bg: "#e4e4e4",
    "bg-elevated": "#ffffff",
    "card-bg": "#ffffff",
    // Reuse accent-soft: gray #f0f0f0 was invisible on white cards in light mode
    "card-bg-active": "#d9f1e4",
    "text-field-bg": "#f2f2f2",

    "text-primary": "#17231f",
    "text-secondary": "#5f7870",
    "text-muted": "#809991",

    accent: "#2bbf6c",
    "accent-soft": "#d9f1e4",
    "on-accent": "#0f1a17",

    "border-subtle": "#d9d9d9",

    "sidebar-bg": "#ffffff",
    // Same as accent-soft / card-bg-active — no gray leftover from the old #f0f0f0 hover
    "sidebar-item-hover": "#d9f1e4",
    "sidebar-sender": "#2bbf6c",
    "sidebar-unread": "#2bbf6c",

    "composer-outer": "#ffffff",
    "composer-send": "#2bbf6c",
    "composer-icon": "#8aa199",

    "msg-bg": "#ffffff",
    "msg-own-bg": "#d8f1e3",
    "msg-time": "#809991",
    "msg-call-bg": "#cae9da",
    "msg-selected": "#d7efe1",

    "icon-base": "#809991",
    "icon-disable": "#b0c2ba",
    "icon-hover": "#d9f1e4",
    "icon-active": "#17231f",

    "notice-base": "#2bbf6c",
    "notice-disable": "#9aafa8",
    "badge-bg": "#2bbf6c",
    "badge-text": "#ffffff",

    "call-bg": "#cae9da",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "#f2f2f2",
    "search-hint": "#809991",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },
};
