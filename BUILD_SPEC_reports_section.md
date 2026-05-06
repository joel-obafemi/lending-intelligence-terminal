# Lending Terminal — Reports Section Build Spec

This document specifies the implementation of a `/reports` section on the Lending Terminal dashboard. It is written for Claude Code or any developer agent to act on directly.

---

## Goal

Add a dedicated reading destination at `/reports` where the monthly State of DeFi Lending on Ethereum issues are published. Each issue is authored as an MDX file, rendered through a single page template, and presented with a reading experience designed to be referenced by professional research audiences. The destination must:

1. Read like a long-form research publication, not a styled blog.
2. Embed live charts that pull from the same data layer powering the dashboard.
3. Support per-issue freeze-date snapshots so historical issues stay accurate.
4. Be editable by the author through MDX files in the repo, with no custom CMS.
5. Generate cover images and OG metadata at build time.
6. Publish an RSS feed at `/reports/feed.xml`.

---

## Tech assumptions

- Next.js 14+ App Router
- React 18+
- MDX with `next-mdx-remote` or `@next/mdx` for content rendering
- Tailwind CSS for styling
- Existing chart library on the dashboard (Recharts, Chart.js, or visx)
- Existing data layer/API that powers Sector Overview, Rates, Revenue, etc.
- Static site generation for issue pages, with revalidation triggered by content changes

If the project uses different tools, adapt the structure but preserve the architectural intent.

---

## File structure

```
/app
  /reports
    /page.tsx                      # Archive landing page
    /[slug]
      /page.tsx                    # Individual issue page
      /opengraph-image.tsx         # Dynamic OG image generation
    /feed.xml
      /route.ts                    # RSS feed endpoint
/content
  /reports
    /2026-04-april.mdx             # Issue #001 content
    /2026-05-may.mdx               # Future issues
/components
  /report
    /Hero.tsx                      # Issue page hero with cover
    /Lead.tsx                      # Drop-cap opening paragraph
    /PullQuote.tsx                 # Visual pull quote
    /Chart.tsx                     # Live chart embed with snapshot toggle
    /DataTable.tsx                 # Sortable data table
    /Annotation.tsx                # Inline aside / sidebar note
    /MethodologyNote.tsx           # Collapsible methodology section
    /TOC.tsx                       # Sticky table of contents
    /ProgressBar.tsx               # Top-of-viewport reading progress
    /ShareToolbar.tsx              # Text-selection share toolbar
    /NextIssue.tsx                 # End-of-issue navigation
    /NewsletterSignup.tsx          # Email capture
    /CiteWidget.tsx                # Citation generator
    /SectionHeading.tsx            # Anchored section heading with copy-link
    /ChartFreezeToggle.tsx         # "Snapshot" vs "Live" chart toggle
/public
  /reports
    /2026-04-april-cover.png       # Generated portrait cover
    /2026-04-april-social.png      # Generated social card
/lib
  /reports
    /getAllIssues.ts               # Read all MDX files, return metadata
    /getIssueBySlug.ts             # Load single issue with parsed frontmatter
    /generateCoverImage.ts         # HTML-to-PNG cover generation
```

The two cover HTML templates already exist in `/outputs/cover_issue_001_*.html`. Either generalize them as React components that accept props (preferred long-term) or keep them as static HTML templates rendered through Puppeteer at build time.

---

## Routing

| Route | Purpose | Generation |
|-------|---------|------------|
| `/reports` | Archive landing page; latest issue as hero, all issues as grid | Static |
| `/reports/[slug]` | Individual issue page | Static, one per MDX file |
| `/reports/feed.xml` | RSS 2.0 feed of all issues | Static, regenerated on content change |
| `/reports/[slug]/opengraph-image` | Per-issue OG image | Dynamic at edge |

The slug format is `YYYY-MM-monthname` (e.g., `2026-04-april`). Frontmatter in each MDX file declares the slug; if absent, derive from filename.

---

## MDX frontmatter schema

Every issue MDX file starts with frontmatter that drives metadata and SEO:

```yaml
---
title: "State of DeFi Lending on Ethereum"
issue_number: 1
issue_label: "№001"
date: "2026-04-30"                    # End-of-period snapshot date
publication_date: "2026-05-07"        # Public release date
theme: "The rsETH Reckoning"
tagline: "How a single bridge exploit cascaded through DeFi lending in 96 hours, and the bad-debt question that remains unresolved."
reading_time_min: 22
cover_image: "/reports/2026-04-april-cover.png"
social_image: "/reports/2026-04-april-social.png"
protocols: ["Aave V3", "Spark", "Morpho", "Fluid"]
freeze_date: "2026-04-30T23:59:00Z"   # Used by Chart components for default state
status: "published"                    # published | draft | archived
---
```

The `freeze_date` is critical. Charts default to showing data up to this timestamp; a toggle lets the reader switch to "live" which reloads from current data. This is the differentiator versus every other crypto research site.

---

## Component specifications

Each component below is required. Specs are tight; implementation details are at developer discretion provided the visual and behavioral intent is preserved.

### `<Hero />`

Full-bleed top-of-page block. Pulls metadata from MDX frontmatter via context. Renders:

- Cover image as background, slightly darkened gradient overlay at the bottom edge for legibility
- Title in serif typeface, large (around 56-72px on desktop), with an italic-styled "of" or similar typographic detail matching the cover
- Issue label (№001) and date in monospaced caps
- Theme tagline in italic serif, accent color
- Reading-time estimate
- Quick metadata: protocols covered, snapshot date

The hero is the first impression. Treat it as a magazine cover, not a header.

### `<Lead>`

Wraps the opening paragraph of the issue. Renders the paragraph with a drop cap on the first letter (around 4 lines tall, accent color or near-black, serif), and a slightly larger body type than standard prose (around 20-22px instead of 18px). Use only once per issue.

```mdx
<Lead>April was the month an attacker drained Kelp's rsETH bridge adapter...</Lead>
```

### `<SectionHeading>`

Replaces standard `## Heading` markdown. Renders an h2 with:

- Auto-generated slug ID for anchoring
- A small section number prefix in monospaced caps (e.g., "01" or "§ 1")
- A copy-link icon that appears on hover, copying the full URL with anchor to clipboard
- Ample top spacing (around 80-100px above) for visual section breaks

MDX should still allow plain `##` for sub-headings that don't need section status. Distinguish via component vs. markdown syntax.

### `<PullQuote>`

Visual pull quote. Renders large italic serif text (around 28-36px), with a thick left border in the accent color, breaking out of the body column slightly to draw the eye. Include an attribution line if provided (optional).

```mdx
<PullQuote>The capital that left Aave V3 chose Spark almost exclusively. Fluid, despite its capital-efficiency advantages on paper, did not capture the rotation.</PullQuote>
```

Use sparingly. Two to four pull quotes per issue is the right cadence. They are punctuation, not content.

### `<Chart>`

The most important component. Renders a live chart from the dashboard's data layer, with a freeze-date default and a "show current" toggle.

Props:

```ts
type ChartProps = {
  source: string;                    // Identifier matching a chart in the dashboard's chart registry, e.g., "rates.real-yield-spread"
  range?: "30d" | "90d" | "12m" | "18m" | "24m" | "all";
  asset?: string;                    // For asset-scoped charts, e.g., "USDC"
  protocol?: string;                 // For protocol-scoped charts
  caption?: string;                  // Caption shown below the chart
  source_label?: string;             // Source attribution, e.g., "DefiLlama, FRED"
  annotations?: Array<{              // Optional event markers
    date: string;
    label: string;
    color?: string;
  }>;
  height?: number;                   // Default 360px
};
```

Behavior:

1. On mount, fetches the chart's data from the dashboard's data layer, using the issue's `freeze_date` as the upper bound by default.
2. Renders the chart with the same visual style as the dashboard charts (consistent color palette, axis styling, tooltip behavior).
3. Above the chart, a small toggle: "Apr 30 snapshot" (selected) | "Live data". Clicking "Live data" refetches without the freeze constraint and re-renders.
4. Below the chart, a caption in italic serif and a source line in muted monospaced text.
5. Includes a "share this chart" icon that copies a permalink with anchor to the specific chart.

The chart registry on the dashboard side needs to expose chart definitions by string ID so the `source` prop maps to a real chart. If a registry does not exist yet, build it as part of this work.

### `<DataTable>`

Sortable data table for things like the Cheat Sheet, fee comparisons, and the Markets table. Supports striped rows, sticky header, optional caption, and optional sort/filter controls.

```ts
type DataTableProps = {
  caption?: string;
  columns: Array<{ key: string; label: string; align?: "left" | "right"; sortable?: boolean }>;
  rows: Array<Record<string, string | number>>;
  source_label?: string;
};
```

Visual: monospaced numerals for numeric columns, serif for label columns, a thin top and bottom border in the accent color, no vertical lines. Table should be horizontally scrollable on mobile.

### `<Annotation>`

Inline aside. On desktop, renders as a small box in the right margin (outside the prose column). On mobile, collapses inline as an indented box below the paragraph it follows. Use for footnote-style asides, technical clarifications, or methodology notes that don't merit their own section.

```mdx
The route was set up as a 1-of-1 DVN path.

<Annotation>DVN stands for decentralized verifier network. LayerZero's verification model assigns one or more DVNs to attest to inbound packets; a 1-of-1 configuration means a single DVN can finalize attestation, which is what made this path exploitable.</Annotation>
```

### `<MethodologyNote>`

Collapsible block. Renders a clickable header ("Methodology") with a chevron. Expands to show the methodology content. Keep methodology accessible but out of the main reading flow.

### `<TOC>`

Sticky table of contents on the right side of the viewport (desktop only). Auto-generated from `<SectionHeading>` components in the page. Highlights the currently-visible section based on scroll position. On mobile, hidden by default; surfaced via a hamburger icon at the top.

### `<ProgressBar>`

Thin horizontal bar at the very top of the viewport, fills left-to-right as the reader scrolls through the article. Accent color. Sticky positioned. About 3-4px tall.

### `<ShareToolbar>`

Floating toolbar that appears when the reader selects text in the article body. Three actions:

1. "Tweet this excerpt" — opens X with selected text and link to the issue, with the paragraph anchor included
2. "Copy with citation" — copies the selected text plus a formatted citation (Author, Year, Issue Number, Anchor URL)
3. "Copy permalink" — copies the URL with the W3C text fragment encoded (`#:~:text=...`)

### `<NextIssue>`

End-of-article navigation. Three columns on desktop:

1. Left: previous issue card (cover thumbnail, title, date)
2. Center: newsletter signup with single email input
3. Right: next issue card (or "Next issue arrives [date]" if not yet published)

### `<NewsletterSignup>`

Embedded email capture. Single field, single submit button. Use a hosted provider (Beehiiv, Substack, ConvertKit) via API or embed; do not build email infrastructure.

### `<CiteWidget>`

Citation generator. Sits at the end of the article (between the methodology and end navigation). Renders three formats:

- Short: "DatumLabs. (2026). State of DeFi Lending on Ethereum, Issue №001. [URL]"
- Academic: full APA-style citation
- X-friendly: pre-formatted tweet with URL

Each has a "copy" button.

### `<ChartFreezeToggle>`

Internal component used by `<Chart>`. Two-button segmented control: snapshot date (default) and Live. Tracks selected state. When toggled, dispatches a re-fetch event to the chart.

---

## Section-by-section design

Each issue follows the same structural template. Here are the sections in order, with the design intent for each.

### 1. Hero block

Full-bleed cover image as background. Title overlay positioned bottom-left of the image. Below the image, in a contained reading column:

- Reading-time estimate, in muted monospaced text
- Three small links: "Subscribe" | "Cite this issue" | "Download PDF"

The hero ends at the page break. The article body starts in a tighter reading column below.

### 2. How to read this report (primer section)

Optional section, present in early issues until the reader audience matures. Renders as a slightly-smaller body type (around 16px) in a contained column. Explains basis points, percentage points, and the Real Yield Spread concept. Hide-after-first-read can be implemented via local storage if desired.

### 3. The Cheat Sheet

Single-page screenshot-friendly summary. Renders as a series of `<DataTable>` components stacked vertically. Use a tighter line-height and slightly more compact spacing than the rest of the article. Include a "Copy as image" button that captures the cheat sheet block as a PNG for easy social sharing.

### 4. Executive Summary

Five paragraphs, no bullets, no headings within. The opening paragraph should use `<Lead>` for the drop cap. The other paragraphs use standard body styling. After the executive summary, insert one `<PullQuote>` with the issue's most quotable sentence.

### 5. Macro Context

Standard prose with one or two embedded `<Chart>` components and one `<Annotation>` for technical clarification. The Real Yield Spread chart anchors this section.

### 6. Sector Overview

Mostly prose. Includes the Market Share by Borrows chart, Net Flows chart, and Composition donuts. Each via `<Chart>`. Tables (top markets, etc.) via `<DataTable>`.

### 7. Protocol Deep Dives

Four sub-sections, one per protocol, in fixed order: Aave V3, Spark, Morpho, Fluid. Each opens with a one-paragraph state-of-the-protocol intro, followed by `<Chart>` for the protocol's supply/borrow composition. Then prose with embedded charts and one `<PullQuote>` per protocol if there's a sharp finding.

### 8. Theme essays (1-2 per issue)

Long-form prose with sub-headings. Each theme essay is treated like a standalone article with its own internal structure (numbered stages, in the case of the rsETH Reckoning). Charts and data tables embedded inline where they support the argument.

### 9. Risk Watch

Verdict strip at top (4 stat cards rendered as a custom layout component), then prose, then 2-3 charts/tables (Stablecoin Debt Share, Oracle Map, Liquidation Intensity).

### 10. Notable Events Timeline

Either prose paragraphs (current treatment) or a custom `<Timeline>` component if you want to invest in a more structured visual treatment for events. Either is fine.

### 11. What to Watch

Five numbered watch items, each with a heading and a paragraph. Render section headings as `<SectionHeading>` so each item gets its own anchor.

### 12. Methodology

Full methodology accessible via `<MethodologyNote>` collapsible at the bottom, OR as a persistent section above the end-of-issue navigation. Author preference. The latter is more discoverable; the former is less visually heavy.

### 13. End-of-issue navigation

`<CiteWidget>` first, then `<NextIssue>` last. The reader's last surface should be either a citation or a path forward.

---

## Cover image generation

Two cover assets per issue:

1. Portrait cover (1240×1748): used as the issue page hero background and the Word doc / PDF first page.
2. Social card (1200×630): used as the og:image meta tag and Twitter card image.

Both are HTML/CSS templates parameterized by issue data. The Issue #001 templates exist in `/outputs/cover_issue_001_portrait.html` and `/outputs/cover_issue_001_social.html`.

To generalize them as React components:

```ts
type CoverProps = {
  issue_number: number;
  issue_label: string;
  date: string;
  theme: string;
  tagline: string;
  protocols: string[];
};
```

The chart annotation in the social card should be parameterized by issue too. April uses the Real Yield Spread sparkline with the -26 bps annotation. May might use a different metric. Pass the chart definition as an additional prop or via a `data_viz` slot.

Build pipeline: render each cover at build time through Puppeteer or a similar HTML-to-PNG library. Output to `/public/reports/[slug]-cover.png` and `/public/reports/[slug]-social.png`. Cache aggressively (cover image rarely changes after publication).

Alternative for dynamic OG images: use Next.js's built-in `opengraph-image.tsx` convention which generates OG images at the edge. This is simpler than Puppeteer for the social card use case.

---

## RSS feed

`/reports/feed.xml` returns RSS 2.0 XML. Each `<item>` includes:

- title: issue title plus theme
- link: full URL to issue page
- guid: unique identifier (use the slug)
- pubDate: issue's publication_date as RFC-822
- description: the issue's tagline plus the lead paragraph (HTML-safe)
- enclosure: the cover image URL

Add `<link rel="alternate" type="application/rss+xml" href="/reports/feed.xml" title="State of DeFi Lending — DatumLabs">` to the `<head>` of the entire dashboard so RSS readers auto-discover.

---

## SEO and metadata

Each issue page must include:

- `<title>`: "[Issue title] · Issue №[number] · [Theme]"
- `<meta name="description">`: the tagline
- `<meta property="og:title">`: same as title
- `<meta property="og:description">`: tagline
- `<meta property="og:image">`: social card URL
- `<meta property="og:image:width">` and `og:image:height`: 1200, 630
- `<meta property="og:type">`: article
- `<meta property="article:published_time">`: publication_date
- `<meta property="article:author">`: DatumLabs URL
- `<meta name="twitter:card">`: summary_large_image
- `<link rel="canonical">`: the issue URL
- JSON-LD Article schema in a `<script type="application/ld+json">` block

The archive page (`/reports`) gets standard metadata pointing to the latest issue's tagline as the description.

---

## Visual design tokens

These tokens should be defined in a single config file (Tailwind theme extension or CSS custom properties) and used consistently:

```css
--report-bg: #F7F4ED;              /* cream */
--report-bg-dark: #0E1B2C;         /* deep navy for inverse blocks */
--report-text: #0E1B2C;
--report-text-muted: #595959;
--report-text-subtle: #B8C9DD;
--report-accent: #C5511A;          /* burnt orange */
--report-brand: #1F3A5F;           /* navy */
--report-border: #D4CFC2;          /* warm gray for dividers */

--font-serif: "Source Serif 4", "Iowan Old Style", "Charter", Georgia, serif;
--font-sans: "Inter", -apple-system, system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Iosevka", "SF Mono", Consolas, monospace;

--reading-column-width: 720px;
--reading-line-height: 1.75;
--reading-body-size: 18px;
--reading-lead-size: 21px;
```

Colors must match the cover. The report reading experience and the cover should feel like the same publication.

---

## Acceptance criteria

The implementation is complete when:

1. `/reports` renders an archive page listing all MDX files in `/content/reports`, with the latest as a hero card and the rest as a grid below.
2. Each MDX file at `/content/reports/[slug].mdx` renders at `/reports/[slug]` with all components above functional.
3. The `<Chart>` component fetches data from the dashboard's data layer using the slug's freeze_date as the default snapshot, with a working "Live data" toggle.
4. Cover images for Issue #001 are generated at `/public/reports/2026-04-april-cover.png` and `/public/reports/2026-04-april-social.png` and used as og:image and the page hero background.
5. `/reports/feed.xml` returns valid RSS 2.0 with at least the published issues.
6. Selecting any text in the article body triggers the `<ShareToolbar>` with three working share options.
7. The page has a sticky `<TOC>` on desktop that highlights the current section based on scroll position.
8. The page achieves a Lighthouse score of 90+ on Performance, Accessibility, and SEO categories.
9. The page is fully responsive, with the desktop three-column layout collapsing to single-column on mobile.
10. Issue #001 (provided as `2026-04-april.mdx` in this directory) renders end-to-end without errors.

---

## Build order suggestion

1. Set up MDX rendering pipeline and the basic `/reports/[slug]` route. Verify Issue #001 renders with default markdown styling.
2. Build `<SectionHeading>`, `<Lead>`, `<PullQuote>`, `<DataTable>`, `<Annotation>`, `<MethodologyNote>`. These are pure presentation components; no data dependencies.
3. Apply the design tokens and typographic styling. The article should now look right even without charts.
4. Build `<Chart>` and the chart registry on the dashboard side. Test with one chart embedded.
5. Embed remaining charts. Verify freeze-date default works.
6. Build `<TOC>`, `<ProgressBar>`, `<ShareToolbar>`. Reading affordances now complete.
7. Build `<Hero>`, `<NextIssue>`, `<NewsletterSignup>`, `<CiteWidget>`. End-of-flow polish.
8. Cover image generation pipeline. Static for Issue #001 to start; generalize as a React component before Issue #002.
9. RSS feed.
10. SEO metadata, OG images, structured data.
11. Archive landing page.
12. QA, mobile testing, accessibility audit.

Total estimated effort: 5-8 working days for a developer comfortable with Next.js and MDX, depending on how mature the dashboard's data layer is.

---

## Editing future issues

Once the system is built, publishing Issue №002 looks like this:

1. Create `/content/reports/2026-05-may.mdx` with the new frontmatter and body.
2. Generate the new covers (run the cover generation script with the new issue data).
3. Push to repo. Static regeneration handles the rest.

Total time per issue post-build: 30-60 minutes of editorial work, assuming the prose is already drafted.
