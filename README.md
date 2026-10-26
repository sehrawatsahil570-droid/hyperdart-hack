# package-pick

A hyperDart component that answers npm package questions at a glance: what a package is, how two or three packages compare, what could replace one, and which package fits a task.

Every package is drawn as a **shipping label**. An npm package is literally a parcel, so the label shows what a developer checks before "accepting delivery": the install line as the address strip, weekly downloads, size and dependency count as the weight and contents, and compatibility (TypeScript, ESM/CJS, Node) as handling instructions. A deprecated package gets a red rubber stamp.

- **GitHub:** https://github.com/&lt;user&gt;/&lt;repo&gt;
- **Demo video:** https://youtu.be/&lt;id&gt;

---

## What it answers

| Query | What the component shows |
|---|---|
| `npm express` | The package label: version, description, install line, weekly downloads, last publish, unpacked size, dependencies, TypeScript, module format, Node range, license, a 30-day downloads chart, and links |
| `latest version of react` | The answer first: the latest version and its publish date, with the full label below |
| `compare packages express, fastify` | Factual takeaway lines, a side-by-side table, and a shared downloads chart |
| `compare express, fastify, koa` | The same for three packages |
| `npm alternatives to moment` | A ranked list of similar packages (dayjs, date-fns-tz, fecha, js-joda…), each with its shared keywords and weekly downloads, plus a note on how the list was ranked |
| `npm request` | The label with a **DEPRECATED** stamp and npm's own deprecation message |

### Extra features

- **Use-case queries with no package named**, such as `best npm package for date formatting` or `library for parsing csv`. The component extracts the task terms (`date, format` / `parse, csv`), searches npm and lists matching packages by weekly downloads.
- **Install cost and compatibility**: unpacked size, file count, direct and peer dependencies, bundled TypeScript types or an `@types/*` package, ESM / CommonJS / dual, and the declared Node range. Queries that ask about these (`is axios esm`, `express typescript`) put these facts first.
- **Version-aware queries** such as `express 4 vs 5`, `react@18 vs react@19`, or `express 4` (a single spec is compared with the latest release). Each spec resolves to the newest matching stable release and is compared on release date, Node range, dependencies, size, module format, types and release-line activity. A bar shows last week's downloads split by major version.
- **Follow-up actions without a new search**: "Compare with…" (with autocomplete), "See alternatives", "Add a package", removing a package from a comparison, "Compare the first two", and "Recent releases". A back link returns to the previous view.
- **Unknown packages** get a clear "No package called … on npm" message with close-match suggestions (npm search results within a small edit distance, so `fastifyy-qq` suggests `fastify`).

---

## Design decisions

**Answer first, then detail.** Each view opens with the direct answer: the version for "latest", the takeaways for a comparison, the ranked list for alternatives. Details follow underneath for anyone who wants to dig deeper.

**One loud element.** The deprecated stamp is the only bold visual element. Everything else is quiet: label borders in the text colour, one condensed sans for headings (IBM Plex Sans Condensed), and monospace (IBM Plex Mono) only for real code such as names, versions and commands. The fonts are optional; if Google Fonts is blocked, system fonts are used.

**Consistent package colours.** In comparisons each package keeps one colour across the name chips, the table header and the chart lines.

**Sidebar and mainline.** Layout follows the component's actual width rather than only the `format` prop. Below 560 px the label's facts become a 2×2 grid, and comparison rows put the fact name above the values so three columns still fit at about 340 px.

**Light and dark.** Colours are CSS variables on the root element. They switch on the MUI theme mode that `withHD` provides, so the component follows the platform's theme.

**Accessibility.** Controls are real buttons with visible focus. The chart can be read with the arrow keys and has a text summary. Focus moves to the new view after a follow-up action, and the loading animation respects reduced motion.

### Accuracy and responsibility

- **No invented winner.** Takeaways state measured differences only, such as "express had 9.3× the weekly downloads of fastify" or "fastify ships TypeScript types; express relies on @types". A line is only shown when the data exists for every package.
- **Missing days are not zeros.** npm's download counts contain outage days reported as 0 for every package. A zero on a package with steady traffic is treated as "no data": the chart shades that day and breaks the line instead of drawing a collapse, the 30-day trend is only computed from fully reported weeks, and a weekly count that includes such days says it is likely low.
- **Honest charts.** The downloads y-axis always starts at zero. When one package dwarfs another, a **Trend** toggle indexes each line to its own first-week average (= 100), and the chart is labelled that way, so shapes can be compared without implying equal numbers. Bars in ranked lists are also drawn from zero.
- **Transparent ranking.** The alternatives and use-case lists print the rule that produced them, including how many low-traffic matches were hidden.
- **Sources are stated.** If download counts fall back to npm search, or the download history is unavailable, the UI says so instead of showing a blank or zero.
- **Limits are labelled.** Unpacked size is marked "excl. deps". Module format is described as declared in `package.json`.

---

## Data sources

All public, no API key, called directly from the browser.

| Data | Endpoint | Used for |
|---|---|---|
| Latest manifest | `registry.npmjs.org/{pkg}/latest` | Version, description, deprecation, license, dependencies, `engines`, `types`, `exports`, `type`, `dist.unpackedSize` |
| Search | `registry.npmjs.org/-/v1/search?text=…` | Latest publish date, dependents, keywords, alternatives and use-case candidates; fallback weekly downloads |
| Full packument | `registry.npmjs.org/{pkg}` | Version-aware queries, release history, publish date when search lacks it |
| Weekly downloads | `api.npmjs.org/downloads/point/last-week/{pkg}` | Weekly downloads |
| Daily downloads | `api.npmjs.org/downloads/range/last-month/{pkg}` | 30-day chart |
| Per-version downloads | `api.npmjs.org/versions/{pkg}/last-week` | Share of downloads by major version |
| DefinitelyTyped | `registry.npmjs.org/@types%2f{pkg}/latest` | Whether an `@types` package exists |

Notes:
- Scoped names are encoded as `@scope%2fname` for the registry.
- The registry does not resolve ranges like `4` or `^4`, so version specs are resolved against the version list in the packument.
- The full packument can be several megabytes for popular packages (react is about 7 MB), so it is only fetched for version queries, release history, or when search has no publish date. Deprecated packages such as `request` don't appear in npm search, which is why the fallback exists.

---

## How it works

### Working out the intent

`searchData` gives the recognised packages (`entities`, with `sourceID` as the npm name) but not the intent, so `src/frontend/lib/intent.js` reads the query:

1. **Normalize** `searchData`. It may be an object, an array of objects, or a bare entity list.
2. **Collect package names** from entities in query order, so "compare vue and react" shows vue first.
   - If the platform recognised fewer packages than the query clearly names (for example a package outside the top 10,000), name-shaped tokens from the query fill the gap.
   - In a query that describes a task ("library for parsing csv", "best package for dates"), entity words are task terms, not the subject, so `csv` does not open the csv package.
3. **Find version specs** like `4`, `v5` or `@18`.
4. **Match intent rules.** `INTENT_RULES` is checked top to bottom and the first match wins:

| Order | Intent | Matches when |
|---|---|---|
| 1 | alternatives | the query says "alternatives", "similar to", "packages like", "replace", "instead of"… |
| 2 | versions | one package and one or two version specs |
| 3 | compare | two or more packages, or "compare / vs / versus" |
| 4 | history | "releases", "release history", "changelog", "versions" |
| 5 | install | "size", "typescript", "esm", "cjs", "node version", "compatible"… (before latest, so "node version" is about Node support) |
| 6 | latest | "latest / current / newest … version" |
| 7 | details | any package named |
| 8 | use case | no package, and task words remain after removing filler |

Cue words are tested against the query with the package names removed, so `node-fetch` never reads as "node".

**Adding a query pattern is one line** in `INTENT_RULES`. If the platform also needs to trigger on the new wording, add a regex in `hyperdart.config.js`.

### Alternatives (`lib/discover.js`)

1. **Pick keywords.** Take the package's npm keywords minus generic ones (`javascript`, `node`, `library`…). Keywords that also appear in the description come first, because keyword lists are often alphabetical, and a generic keyword is kept when the description uses it (express is a "web framework").
2. **Search.** Run one `keywords:` search for each of the top three keywords, plus `keywords:<name>` for packages that position themselves against the subject. npm orders single-keyword results by popularity, which surfaces established packages.
3. **Drop companions.** Plugins and companions are removed: `moment-timezone`, `@types/moment`, packages in the subject's scope, and add-ons whose name or description says plugin, helpers, adapter, preset, loader or bindings.
4. **Keep matches.** A candidate stays if it shares at least 2 keywords (1 if the subject has fewer than 3), including the primary keyword (the first one the description uses, e.g. `date` for moment). Listing the subject's name as a keyword counts as one shared keyword, not an automatic pass, because middleware does this too.
5. **Hide long-tail packages.** Anything under 1,000 weekly downloads, or under 0.05% of the subject's downloads, is hidden.
6. **Rank.** Sorted by weekly downloads, with one package per scope (a family like `@date-io/*` is a set of adapters, not separate choices). npm search omits deprecation, so the shown packages' manifests are checked and deprecated ones move to the bottom.

### Use-case search

1. **Extract terms.** Filler words are removed and terms are lightly stemmed ("parsing" → "parse").
2. **Search.** Run a plain text search plus a `keywords:` search.
3. **Filter and sort.** Keep packages whose name, description or keywords contain every term, sorted by weekly downloads. If fewer than three match every term, npm's own relevance order is used and the UI says so.

### Robustness

- **One fetch wrapper.** Every request goes through `fetchJSON` in `lib/npm.js`, which adds:
  - a timeout (9 s; 20 s for packuments),
  - one retry on network errors, `429` (honouring `Retry-After`) and `5xx`,
  - typed errors: `not-found`, `rate-limited`, `network`, `server`, `bad-data`,
  - a promise cache, so follow-up actions reuse data and failed requests aren't cached.
- **Only the manifest is required.** Search, downloads, history and `@types` are loaded with `Promise.allSettled`. Missing pieces are recorded as gaps and shown as "unavailable" rather than breaking the card.
- **Partial failures in comparisons.** If one package can't load, the others are still shown, with a note naming the one that failed.
- **Unknown package versions.** The registry answers these with a bare JSON string; this is detected and reported.
- **Platform notification.** `messageHandlers.componentLoaded()` is called once, when the first view has data or an error.

---

## Project structure

```
src/frontend/
├── index.jsx            withHD(PackageLens), the entry point required by the template
├── PackageLens.jsx      root: intent → view, navigation stack, theme, width
├── DetailsView.jsx      package label (details / latest / install focus), release history
├── CompareView.jsx      takeaways, side-by-side table, downloads chart
├── VersionsView.jsx     version-aware comparison and downloads by major
├── DiscoverViews.jsx    alternatives and use-case ranked lists
├── Chart.jsx            hand-built SVG line chart (no chart library)
├── ui.jsx               loading, errors, suggestions, picker, copy button, hooks
├── styles.css           design tokens and all component styles
└── lib/
    ├── intent.js        query → intent, package names, versions, use-case terms
    ├── npm.js           fetch wrapper, cache, every npm endpoint
    ├── packages.js      package summary, module format, types, versions
    ├── discover.js      alternatives and use-case ranking
    ├── takeaways.js     factual comparison lines
    └── format.js        number, size and date formatting
```

## Libraries

- **React 19** and **Vite 6**, from the hyperDart `react-vite` template.
- **@hyperdart/frontend** for `withHD`, which provides routing, the theme and platform messaging.
- **@mui/material**, used only for `useTheme()` to read light or dark mode.
- **No chart or UI kit.** The chart is plain SVG and the styles are plain CSS, which keeps the design specific and the code easy to explain.
- **IBM Plex Sans, Sans Condensed and Mono** via Google Fonts (optional).

## Configuration

`hyperdart.config.js` keeps the provided keywords and regexes and extends them, so the component also triggers on how people naturally phrase these questions. 19 keywords and 16 regexes, grouped by intent:

| Intent | Example queries the regexes accept |
|---|---|
| Details | `npm express`, `what is express`, `tell me about lodash`, `express npm`, `express package info` |
| Latest version | `latest version of react`, `react latest version`, `newest version of vue` |
| Compare | `compare express, fastify, koa`, `express vs fastify`, `react or vue`, `difference between react and vue` |
| Alternatives | `alternatives to moment`, `moment alternatives`, `replace moment`, `replacement for request`, `instead of request` |
| Versions | `express 4 vs 5`, `react@18 vs react@19` |
| Install / compatibility | `is axios esm`, `does express support typescript`, `lodash bundle size`, `express node version`, `is request deprecated` |
| Release history | `express changelog`, `react releases`, `express versions` |
| Use case | `best npm package for date formatting`, `top libraries for charts`, `js library to resize images` |

Extra keywords: `alternative to`, `similar packages`, `replacement for`, `node package`, `node module`, `js library`, `javascript library`, `package for`, `library to`, `bundle size`, `esm support`, `typescript support`.

Every phrasing in the table has a test in `tests/intent.test.js`, so a regex never triggers the component on a query it then misreads.

```js
format: { mainline: true, sidebar: true },
```

## Run, build, publish

```bash
npm install
npm start          # local sandbox
npm test           # Vitest: 153 unit tests for src/frontend/lib (no network)
npm run build      # outputs dist/frontend/index.modern.js
npm publish        # runs scripts/validate-publish.js (keywords, regex, build, links)
```

Before the first publish, create the package in the Partner Portal (**My packages → Create package**) and set your token with the command shown there. Publish with plain `npm publish`; validation must not be skipped. `node_modules` and `dist` are excluded by `.gitignore`.

---

## Known limitations

- **Module format** is read from `package.json` (`type`, `exports`, `main`, `module`), not from the shipped files.
- **Unpacked size** covers the package itself, not its dependency tree.
- **Alternatives depend on npm keywords.** Packages with few or generic keywords (lodash, for example) get weaker matches, and packages with no keywords at all (date-fns) or only one shared keyword (luxon lists just `date` and `immutable`) can be missed. A package with no descriptive keywords (react) gets a message instead of a list. The ranking rule is shown so users can judge the list.
- **npm search is not fuzzy.** Autocomplete and close-match suggestions only find what npm search returns; typing `expre` does not suggest `express`.
- **Search can lag** a fresh publish by a few minutes. The packument is used when search disagrees with the registry.
- **Version-aware queries download the full packument**, which is slow for very large packages. A loading message says so.
- **Bundle size.** The template's Vite config bundles React and MUI into the output, so the built file is larger than the component code itself.

---

## How I built it (AI use)

I used **Claude (Anthropic, Claude Opus 5.5)** as a coding assistant.

**Generated with Claude:**
- the project scaffold from the `react-vite` template,
- the data layer, intent parser and ranking logic,
- the React views, SVG chart and CSS,
- this README.

**Tested with Claude:**
- the intent parser on the example queries from the problem statement,
- the data layer against the live npm registry (express, fastify, koa, request, react, moment, axios and others),
- every view rendered in headless Chrome through the dart frame, in light and dark, at mainline width and at 340–380 px,
- failure handling with simulated outages: the downloads API returning 503 (weekly downloads fall back to npm search, the chart is replaced by a note) and every npm call returning 429 (one retry, then a clear message with "Try again").

Claude also adjusted the alternatives ranking based on those results (one search per keyword, a required primary keyword, add-on filtering, one package per scope), and added the missing-day handling after finding that npm's daily counts contain outage days reported as zero.

**What I wrote or changed myself:**
<!-- Fill this in honestly before submitting. Examples: design choices you made, bugs you fixed, query patterns you added, styling you changed, testing you did in the sandbox. Judges will ask you to explain and modify the code live. -->
- …
- …
