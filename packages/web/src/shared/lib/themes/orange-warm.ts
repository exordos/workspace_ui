import type { ThemePalette } from "./tokens";

export const orangeWarm: ThemePalette = {
  id: "orange-warm",
  name: "Orange Warm",

  dark: {
    bg: "#1b1b1d",
    // Figma darkSurface — chrome panels (sidebars, headers) sit below Card base
    "bg-elevated": "#333333",
    "card-bg": "#373737",
    "card-bg-active": "#4b4b4b",
    "text-field-bg": "#3d3d3d",

    "text-primary": "#ffffff",
    "text-secondary": "#999999",
    "text-muted": "#707070",

    accent: "#ff8438",
    "accent-soft": "#5a2f0f",
    "on-accent": "#1b1b1d",
    danger: "#d92d20",

    "border-subtle": "#3f3f45",

    // Same Surface as bg-elevated (token kept for theme-picker / future use)
    "sidebar-bg": "#333333",
    // Same as card-bg-active — old #38383a disappears on left sidebar card-bg (#373737)
    "sidebar-item-hover": "#4b4b4b",
    "sidebar-sender": "#ff8438",
    "sidebar-unread": "#ff0000",

    "composer-outer": "#333333",
    "composer-send": "#ff8438",
    "composer-icon": "#707070",

    // Peer bubbles match Card base (not Surface chrome)
    "msg-bg": "#373737",
    "msg-own-bg": "#47382b",
    "msg-time": "#999999",
    "msg-call-bg": "#31402d",
    "msg-selected": "rgba(255, 132, 56, 0.32)",

    "icon-base": "#707070",
    "icon-disable": "#474747",
    "icon-hover": "#999999",
    "icon-active": "#ffffff",

    "notice-base": "#ff0000",
    "notice-disable": "#5c5855",
    "badge-bg": "#ff0000",
    "badge-text": "#ffffff",

    "call-bg": "#31402d",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "rgba(255, 255, 255, 0.08)",
    "search-hint": "#707070",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },

  light: {
    // Figma light: Background / Surface / Card base
    bg: "#e6e6e6",
    "bg-elevated": "#ffffff",
    "card-bg": "#f5f5f5",
    "card-bg-active": "#ffe7cc",
    "text-field-bg": "#e6e6e6",

    "text-primary": "#1b1b1d",
    "text-secondary": "#787878",
    "text-muted": "#989898",

    accent: "#ff8438",
    "accent-soft": "#ffe7cc",
    "on-accent": "#1b1b1d",
    danger: "#d92d20",

    "border-subtle": "#d9d9d9",

    "sidebar-bg": "#ffffff",
    // Card/background active — selected/hover fill on the chat list
    "sidebar-item-hover": "#ffe7cc",
    "sidebar-sender": "#ff8438",
    "sidebar-unread": "#ff8438",

    "composer-outer": "#ffffff",
    "composer-send": "#ff8438",
    "composer-icon": "#989898",

    "msg-bg": "#ffffff",
    "msg-own-bg": "#fff1e2",
    "msg-time": "#989898",
    "msg-call-bg": "#e2ffe9",
    "msg-selected": "#ffd9ae",

    "icon-base": "#989898",
    "icon-disable": "#474747",
    "icon-hover": "#ffe7cc",
    "icon-active": "#1b1b1d",

    "notice-base": "#ff8438",
    "notice-disable": "#989898",
    "badge-bg": "#ff8438",
    "badge-text": "#ffffff",

    "call-bg": "#e2ffe9",
    "call-green": "#26c038",
    "call-red": "#e43535",

    "search-bg": "#e6e6e6",
    "search-hint": "#989898",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },
};
