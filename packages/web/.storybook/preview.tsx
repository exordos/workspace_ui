import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { getLocale, getSupportedLocales, setLocale } from "~/i18n/i18n";
import type { Locale } from "~/i18n/i18n";
import { applyTheme } from "~/shared/lib/themes/engine";
import { defaultPaletteId, palettes } from "~/shared/lib/themes/registry";
import { LocalizedDocsPage } from "./docs-page";
import "~/app/app.styles.css";
import "~/app/focus-outline.styles.css";
import "./preview.css";

function PreviewTheme({
  children,
  palette,
  mode,
  locale,
}: Readonly<{
  children: ReactNode;
  palette: string;
  mode: "light" | "dark";
  locale: Locale;
}>) {
  useLayoutEffect(() => {
    // Root tokens also reach dialogs, menus and tooltips rendered through body portals.
    applyTheme(palette, mode);
    document.documentElement.style.colorScheme = mode;
    document.documentElement.lang = locale;
  }, [palette, mode, locale]);

  return <>{children}</>;
}

const preview: Preview = {
  tags: ["autodocs"],
  initialGlobals: { palette: defaultPaletteId, mode: "light", locale: "en" },
  globalTypes: {
    palette: {
      description: "Workspace palette",
      toolbar: {
        title: "Palette",
        icon: "paintbrush",
        dynamicTitle: true,
        items: palettes.map(({ id, name }) => ({ value: id, title: name })),
      },
    },
    mode: {
      description: "Workspace color mode",
      toolbar: {
        title: "Mode",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
    locale: {
      description: "Workspace language",
      toolbar: {
        title: "Language",
        icon: "globe",
        dynamicTitle: true,
        items: getSupportedLocales().map(({ id, nativeLabel }) => ({
          value: id,
          title: nativeLabel,
        })),
      },
    },
  },
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    docs: { page: LocalizedDocsPage },
  },
  loaders: [
    ({ globals }) => {
      // Resolve the language before story render functions build translated prop values.
      const locale = globals.locale === "ru" ? "ru" : "en";
      if (getLocale() !== locale) setLocale(locale);
      return {};
    },
  ],
  decorators: [
    (Story, { globals }) => (
      <PreviewTheme
        palette={typeof globals.palette === "string" ? globals.palette : defaultPaletteId}
        mode={globals.mode === "dark" ? "dark" : "light"}
        locale={globals.locale === "ru" ? "ru" : "en"}
      >
        <Story />
      </PreviewTheme>
    ),
  ],
};

export default preview;
