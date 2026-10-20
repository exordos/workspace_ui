import { useCallback, useContext, useId, useState, useSyncExternalStore } from "react";
import {
  Anchor,
  Canvas,
  Controls,
  Description,
  DocsContext,
  Heading,
  Markdown,
  Primary,
  Subheading,
  Subtitle,
  Title,
  useOf,
} from "@storybook/addon-docs/blocks";
import type { DocsContextProps } from "@storybook/addon-docs/blocks";
// Pinned Storybook event bridge; check this internal constant when upgrading.
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { styled } from "storybook/theming";
import type { Locale } from "~/i18n/i18n";
import { docsContent, docsPreviewText } from "./docs-content";
import type { ComponentDocsContent } from "./docs-content";
import type { DocsPreviewParameters } from "./docs-preview.types";

type DocsStory = ReturnType<DocsContextProps["storyById"]>;

const labels = {
  en: {
    props: "Properties",
    name: "Name",
    description: "Description",
    default: "Default",
    required: "Required",
    optional: "Optional",
    controls: "Interactive example controls",
    stories: "Stories",
  },
  ru: {
    props: "Свойства",
    name: "Свойство",
    description: "Описание",
    default: "По умолчанию",
    required: "Обязательное",
    optional: "Необязательное",
    controls: "Интерактивные настройки примера",
    stories: "Примеры",
  },
};

// Documentation inherits the Docs theme, independently of the application canvas palette.
const PropsTable = styled.table(({ theme }) => ({
  width: "100%",
  borderCollapse: "collapse",
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s1,
  "th, td": {
    padding: "12px 16px",
    textAlign: "left",
    verticalAlign: "top",
    borderBottom: `1px solid ${theme.appBorderColor}`,
  },
  th: { fontWeight: theme.typography.weight.bold },
  "td:first-of-type": { whiteSpace: "nowrap" },
  code: { fontFamily: theme.typography.fonts.mono, whiteSpace: "pre-wrap" },
  small: { display: "block", marginTop: 4, opacity: 0.7 },
}));

const PreviewToggle = styled.button(({ theme }) => ({
  padding: "8px 12px",
  marginBottom: 12,
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
  color: theme.color.secondary,
  font: "inherit",
  cursor: "pointer",
  "&:focus-visible": { outline: "2px solid currentColor", outlineOffset: 2 },
}));

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function summary(value: unknown): string | undefined {
  const text = record(value)?.summary;
  return typeof text === "string" ? text : undefined;
}

function technicalDefault(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "—";
  } catch {
    return "—";
  }
}

function isOnDemandPreview(value: unknown): value is DocsPreviewParameters {
  return record(value)?.mode === "on-demand";
}

function OnDemandPreview({
  story,
  locale,
  slot,
  activeSlot,
  onToggle,
}: Readonly<{
  story: DocsStory;
  locale: Locale;
  slot: string;
  activeSlot: string | null;
  onToggle: (slot: string) => void;
}>) {
  const regionId = useId();
  const expanded = activeSlot === slot;
  const storyExport: unknown = story.moduleExport;
  return (
    <div>
      <PreviewToggle
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => onToggle(slot)}
      >
        {expanded ? docsPreviewText.hidePreview[locale] : docsPreviewText.showPreview[locale]}
      </PreviewToggle>
      <div id={regionId}>{expanded ? <Canvas of={storyExport} withToolbar /> : null}</div>
    </div>
  );
}

function PropsDocumentation({
  argTypes,
  content,
  locale,
}: Readonly<{
  argTypes: DocsStory["argTypes"];
  content: ComponentDocsContent | undefined;
  locale: Locale;
}>) {
  const headingId = useId();
  const ui = labels[locale];
  const rows = Object.entries(argTypes).filter(
    ([name, row]) =>
      record(row.table)?.disable !== true &&
      (content?.props ? content.props[name] !== undefined : Boolean(row.description)),
  );
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <Heading>
        <span id={headingId}>{ui.props}</span>
      </Heading>
      <div style={{ overflowX: "auto" }}>
        <PropsTable aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">{ui.name}</th>
              <th scope="col">{ui.description}</th>
              <th scope="col">{ui.default}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, row]) => {
              const table = record(row.table);
              const type = record(row.type);
              const typeSummary =
                summary(table?.type) ?? (typeof type?.name === "string" ? type.name : undefined);
              const description = content?.props?.[name]?.[locale] ?? row.description;
              // Story args are examples, never evidence of a component's declared default.
              const defaultValue =
                summary(table?.defaultValue) ?? technicalDefault(row.defaultValue);
              return (
                <tr key={name}>
                  <th scope="row">
                    <code>{name}</code>
                    <small>{type?.required === true ? ui.required : ui.optional}</small>
                  </th>
                  <td>
                    {description ? <Markdown>{description}</Markdown> : null}
                    {typeSummary ? <code>{typeSummary}</code> : null}
                  </td>
                  <td>
                    <code>{defaultValue}</code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </PropsTable>
      </div>
    </section>
  );
}

function LocalizedDocsPageContent() {
  const context = useContext(DocsContext);
  const { preparedMeta, csfFile } = useOf("meta", ["meta"]);
  const { story: primary } = useOf("story", ["story"]);
  const [showControls, setShowControls] = useState(false);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      context.channel.on(GLOBALS_UPDATED, onChange);
      return () => context.channel.off(GLOBALS_UPDATED, onChange);
    },
    [context.channel],
  );
  const getLocale = useCallback((): Locale => {
    const globals: unknown = context.getStoryContext(primary).globals;
    return record(globals)?.locale === "ru" ? "ru" : "en";
  }, [context, primary]);
  // Docs must observe toolbar changes even when no story is mounted to run a locale loader.
  const locale = useSyncExternalStore(subscribe, getLocale);
  const onDemand = isOnDemandPreview(preparedMeta.parameters.docsPreview);
  const togglePreview = (slot: string) =>
    setActiveSlot((current) => (current === slot ? null : slot));
  const content = docsContent[preparedMeta.title];
  const stories = context
    .componentStories()
    .filter((story) => story.tags.includes("autodocs") && !story.usesMount);

  return (
    <article lang={locale}>
      <Title />
      <Subtitle />
      {content ? <Markdown>{content.description[locale]}</Markdown> : <Description of="meta" />}
      {onDemand ? (
        <>
          <p>{docsPreviewText.onDemandHint[locale]}</p>
          <OnDemandPreview
            story={primary}
            locale={locale}
            slot={`primary:${primary.id}`}
            activeSlot={activeSlot}
            onToggle={togglePreview}
          />
        </>
      ) : (
        <Primary />
      )}
      <PropsDocumentation argTypes={primary.argTypes} content={content} locale={locale} />
      <details onToggle={(event) => setShowControls(event.currentTarget.open)}>
        <summary>{labels[locale].controls}</summary>
        {showControls ? (
          <div lang="en">
            <Controls />
          </div>
        ) : null}
      </details>
      {stories.length > 1 ? (
        <>
          <Heading>{labels[locale].stories}</Heading>
          {stories.map((story) => {
            const storyExport: unknown = story.moduleExport;
            const exportName = Object.entries(csfFile.moduleExports).find(
              ([, value]) => value === storyExport,
            )?.[0];
            const description = exportName ? content?.stories?.[exportName]?.[locale] : undefined;
            return (
              <Anchor key={story.id} storyId={story.id}>
                <Subheading>{story.name}</Subheading>
                {description ? (
                  <Markdown>{description}</Markdown>
                ) : (
                  <Description of={storyExport} />
                )}
                {isOnDemandPreview(story.parameters.docsPreview) ? (
                  <OnDemandPreview
                    story={story}
                    locale={locale}
                    slot={`gallery:${story.id}`}
                    activeSlot={activeSlot}
                    onToggle={togglePreview}
                  />
                ) : (
                  <Canvas of={storyExport} />
                )}
              </Anchor>
            );
          })}
        </>
      ) : null}
    </article>
  );
}

export function LocalizedDocsPage() {
  const { preparedMeta } = useOf("meta", ["meta"]);
  // Changing pages discards an active preview before the next page can mount any modal.
  return <LocalizedDocsPageContent key={preparedMeta.title} />;
}
