import type { ThemePalette } from "./tokens";

export const blueMist: ThemePalette = {
  id: "blue-mist",
  name: "Blue Mist",

  dark: {
    bg: "#15181d",
    // Surface = composer-outer — chrome was wrongly glued to card-bg
    "bg-elevated": "#232c38",
    "card-bg": "#243040",
    "card-bg-active": "#30465d",
    "text-field-bg": "#232c38",

    "text-primary": "#f7fbff",
    "text-secondary": "#9aa8b8",
    "text-muted": "#748396",

    accent: "#7d9ddf",
    "accent-soft": "#2f3f66",
    "on-accent": "#111823",
    danger: "#d92d20",

    "border-subtle": "#394a61",

    // Same Surface as bg-elevated / composer-outer
    "sidebar-bg": "#232c38",
    // Same as card-bg-active — old #2a3444 disappears on left sidebar card-bg (#243040)
    "sidebar-item-hover": "#30465d",
    "sidebar-sender": "#8aa8e8",
    "sidebar-unread": "#6f8fda",

    "composer-outer": "#232c38",
    "composer-send": "#7d9ddf",
    "composer-icon": "#748396",

    // Blue Mist exception: peer bubbles use dedicated mock color, not card-bg
    "msg-bg": "#323c4a",
    "msg-own-bg": "#2a3a50",
    "msg-time": "#9aa8b8",
    "msg-call-bg": "#1f473d",
    "msg-selected": "rgba(125, 157, 223, 0.30)",

    "icon-base": "#748396",
    "icon-disable": "#4b596a",
    "icon-hover": "#aab9cc",
    "icon-active": "#f7fbff",

    "notice-base": "#6f8fda",
    "notice-disable": "#646f7f",
    "badge-bg": "#6f8fda",
    "badge-text": "#ffffff",

    "call-bg": "#1f473d",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "rgba(255, 255, 255, 0.08)",
    "search-hint": "#748396",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },

  light: {
    bg: "#e8f0f5",
    "bg-elevated": "#ffffff",
    // Light Figma: soft blue card underlay, darker than white sidebar chrome
    "card-bg": "#eff5fb",
    "card-bg-active": "#d5e5f6",
    "text-field-bg": "#f0f6fc",

    "text-primary": "#1a2330",
    "text-secondary": "#66758a",
    "text-muted": "#8d9bae",

    accent: "#6f90d8",
    "accent-soft": "#dce8fb",
    "on-accent": "#101a28",
    danger: "#d92d20",

    "border-subtle": "#d3dfec",

    "sidebar-bg": "#ffffff",
    "sidebar-item-hover": "#e4edf7",
    "sidebar-sender": "#6f90d8",
    "sidebar-unread": "#6f90d8",

    "composer-outer": "#eff5fb",
    "composer-send": "#6f90d8",
    "composer-icon": "#8fa0b6",

    "msg-bg": "#ffffff",
    "msg-own-bg": "#dbe8f8",
    "msg-time": "#8d9bae",
    "msg-call-bg": "#cfe6dc",
    "msg-selected": "#d5e5f6",

    "icon-base": "#8d9bae",
    "icon-disable": "#b8c3d1",
    "icon-hover": "#dce8fb",
    "icon-active": "#1a2330",

    "notice-base": "#6f90d8",
    "notice-disable": "#9ca9bb",
    "badge-bg": "#6f90d8",
    "badge-text": "#ffffff",

    "call-bg": "#cfe6dc",
    "call-green": "#26c038",
    "call-red": "#f04c4c",

    "search-bg": "#f0f6fc",
    "search-hint": "#8d9bae",

    "indicator-yellow": "#ffd633",
    "indicator-pink": "#f458d2",
    "indicator-purple": "#8d6dff",
    "indicator-green": "#26c038",
    "indicator-orange": "#ff8900",
  },
};
