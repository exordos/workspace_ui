import type { ThemePalette } from "./tokens";

export const blueCold: ThemePalette = {
  id: "blue-cold",
  name: "Blue Cold",

  dark: {
    bg: "#141517",
    "bg-elevated": "#222328",
    "card-bg": "#282a32",
    "card-bg-active": "#2c3747",
    "text-field-bg": "#222328",

    "text-primary": "#ffffff",
    "text-secondary": "#999999",
    "text-muted": "#707070",

    accent: "#7087ff",
    "accent-soft": "#2b2d9a",
    "on-accent": "#141517",

    "border-subtle": "#33384d",

    "sidebar-bg": "#1a1e31",
    "sidebar-item-hover": "#282a32",
    "sidebar-sender": "#7087ff",
    "sidebar-unread": "#3d5eff",

    "composer-outer": "#222328",
    "composer-send": "#7087ff",
    "composer-icon": "#707070",

    "msg-bg": "#333333",
    "msg-own-bg": "#252942",
    "msg-time": "#999999",
    "msg-call-bg": "#1f4637",
    "msg-selected": "rgba(112, 135, 255, 0.32)",

    "icon-base": "#707070",
    "icon-disable": "#474747",
    "icon-hover": "#999999",
    "icon-active": "#ffffff",

    "notice-base": "#3d5eff",
    "notice-disable": "#5c5855",
    "badge-bg": "#3d5eff",
    "badge-text": "#ffffff",

    "call-bg": "#1f4637",
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
    bg: "#e0ecf0",
    "bg-elevated": "#ffffff",
    "card-bg": "#ecf4f8",
    "card-bg-active": "#c9e7ff",
    "text-field-bg": "#eef5fd",

    "text-primary": "#1b1b1d",
    "text-secondary": "#707b88",
    "text-muted": "#97a3b2",

    accent: "#7087ff",
    "accent-soft": "#d9eaff",
    "on-accent": "#1b1b1d",

    "border-subtle": "#d8e4ef",

    "sidebar-bg": "#ffffff",
    "sidebar-item-hover": "#ecf4fc",
    "sidebar-sender": "#7087ff",
    "sidebar-unread": "#7087ff",

    "composer-outer": "#ecf4f8",
    "composer-send": "#7087ff",
    "composer-icon": "#8f9bab",

    "msg-bg": "#ffffff",
    "msg-own-bg": "#cce4fc",
    "msg-time": "#97a3b2",
    "msg-call-bg": "#cfe5d6",
    "msg-selected": "#c9e7ff",

    "icon-base": "#97a3b2",
    "icon-disable": "#b4bfcb",
    "icon-hover": "#c9e7ff",
    "icon-active": "#1b1b1d",

    "notice-base": "#7087ff",
    "notice-disable": "#9ba6b4",
    "badge-bg": "#7087ff",
    "badge-text": "#ffffff",

    "call-bg": "#cfe5d6",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "#eef5fd",
    "search-hint": "#97a3b2",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },
};
