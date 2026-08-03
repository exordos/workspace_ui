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
    danger: "#d92d20",

    "border-subtle": "#33384d",

    // Same Surface as bg-elevated (token kept for theme-picker / future use)
    "sidebar-bg": "#222328",
    // Same as card-bg-active — old value equaled card-bg (#282a32), so chat-list hover vanished
    "sidebar-item-hover": "#2c3747",
    "sidebar-sender": "#7087ff",
    "sidebar-unread": "#3d5eff",

    "composer-outer": "#222328",
    "composer-send": "#7087ff",
    "composer-icon": "#707070",

    // Peer bubbles match Card base (not Surface chrome)
    "msg-bg": "#282a32",
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
    "indicator-blue": "#4b98e6",
    "indicator-red": "#f04c4c",
  },

  light: {
    // Figma blueCold light V2: soft page, white chrome, tinted cards, white peer bubbles
    bg: "#e4ecf3",
    "bg-elevated": "#ffffff",
    "card-bg": "#eef5fb",
    "card-bg-active": "#cde6ff",
    "text-field-bg": "#eef5fb",

    "text-primary": "#1b1b1d",
    "text-secondary": "#787878",
    "text-muted": "#989898",

    accent: "#7087ff",
    "accent-soft": "#cde6ff",
    "on-accent": "#1b1b1d",
    danger: "#d92d20",

    "border-subtle": "#d8e4ef",

    "sidebar-bg": "#ffffff",
    "sidebar-item-hover": "#cde6ff",
    "sidebar-sender": "#7087ff",
    "sidebar-unread": "#7087ff",

    // White chrome — same as sidebars / headers
    "composer-outer": "#ffffff",
    "composer-send": "#7087ff",
    "composer-icon": "#989898",

    // Peer white on soft page; own #AED7FF; call #E2FFE9
    "msg-bg": "#ffffff",
    "msg-own-bg": "#aed7ff",
    "msg-time": "#989898",
    "msg-call-bg": "#e2ffe9",
    "msg-selected": "#cde6ff",

    "icon-base": "#989898",
    "icon-disable": "#474747",
    "icon-hover": "#cde6ff",
    "icon-active": "#1b1b1d",

    "notice-base": "#7087ff",
    "notice-disable": "#989898",
    "badge-bg": "#7087ff",
    "badge-text": "#ffffff",

    "call-bg": "#e2ffe9",
    "call-green": "#26c038",
    "call-red": "#e43535",

    "search-bg": "#eef5fb",
    "search-hint": "#989898",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
    "indicator-blue": "#4b98e6",
    "indicator-red": "#f04c4c",
  },
};
