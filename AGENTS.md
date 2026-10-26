# HyperDart Standalone Component — react+vite

Guide for AI assistants working inside this project. Explains the mandatory folder
structure, config files, props injected by the hyperDart platform, routing rules,
and the build/sandbox workflow — so the AI never breaks conventions when generating
or editing component code.

Full docs: https://hyperdart.com/docs/docs/intro

---

## 1. What is a HyperDart Standalone Component?

A **standalone component** is a self-contained React app that is:
- Bundled as a UMD/ES module and published to the **hyperDart** search platform.
- Loaded inside an **iframe** (called a *Dart Frame*) by the platform.
- Triggered when a user's search query matches the component's `keywords` or `regex` patterns defined in `hyperdart.config.js`.
- Passed a rich `props` object by the platform at runtime.

---

## 2. Mandatory Folder Structure

**Do NOT rename, move, or delete any of the following files/folders.**
The build pipeline and sandbox depend on them.

```
<project-root>/
├── src/
│   ├── frontend/            ← Your component lives here
│   │   ├── index.jsx        ← Entry point; wraps component with withHD HOC
│   │   └── NewComponent.jsx ← Your main React component (rename freely)
│   └── sandbox/             ← Local dev sandbox — DO NOT modify
│       ├── main.jsx
│       └── index.css
├── scripts/
│   └── validate-publish.js  ← Pre-publish validation — DO NOT modify
├── hyperdart.config.js       ← Platform config (keywords, formats, etc.)
├── searchData.json           ← Structured search data for local sandbox testing
├── resource.json             ← Resource schema (query structure for platform AI)
├── RESOURCE.md               ← Docs for resource.json
├── vite.config.js            ← Build config — DO NOT modify
├── index.html                ← Sandbox HTML shell — DO NOT modify
└── package.json
```

### Rules for `src/frontend/`

- `index.jsx` **must** export the component wrapped with `withHD`:
  ```jsx
  import NewComponent from "./NewComponent";
  import { withHD } from '@hyperdart/frontend';
  export default withHD(NewComponent);
  ```
- You **may** rename `NewComponent.jsx` and create sub-components inside
  `src/frontend/`, but the `index.jsx` export must always point to your root component.
- **Do not** add a `BrowserRouter` — `withHD` already provides one (see §5).

---

## 3. Config Files

### `hyperdart.config.js`

Controls how the platform discovers and renders your component.

```js
export default {
  name: pkg.name,           // auto-read from package.json — do not change
  triggers: {
    keywords: ['keyword1', 'keyword2']  // words that trigger this component
  },
  query_format: {
    regex: ['pattern1', 'pattern2']     // regex patterns on the search query
  },
  client: {
    location: pkg.module,               // built JS file — do not change
    moduleName: pkg.umdName || 'HD' + pkg.name,
    baseURL: '/' + pkg.name,            // local dev base URL
  },
  format: {
    mainline: true,   // show in main search results area
    sidebar: true     // show in sidebar
  },
  permissions: {},
  info: {}            // extra metadata added to searchData on publish
}
```

**Only edit:** `triggers.keywords`, `query_format.regex`, `format`, `permissions`, `info`.  
**Never change:** `name`, `client.location`, `client.moduleName`.

### `searchData.json`

Provides mock search data for the **local sandbox** only (ignored after publish).  
Shape is an array — populate it with realistic sample data for your component.

### `resource.json`

**Optional.** Defines a structured query schema to help the platform AI understand
what data your component needs. Editing this is optional — you only need to
customize it if you want finer control over how the platform parses search queries
for your component. See `RESOURCE.md` for field-by-field documentation.

---

## 4. How Triggering Works

When a user's search query matches one of your component's `keywords` or `query_format.regex` patterns (defined in `hyperdart.config.js`), the platform:

1. Activates your component inside a Dart Frame.
2. Parses the search query and injects structured data as `props.searchData`.
3. Passes the full `props` object to your root component.

`props.searchData` is the primary data prop — it contains the matched/parsed search results the platform has resolved for your component based on the query.

---

## 5. Props Injected by the Platform

Your root component receives `props` from the hyperDart platform at runtime.
**Never hardcode** values that come from these props.

### 5.1 `props.messageHandlers`

Callback functions the platform provides for communication:

| Method | When to call |
|--------|-------------|
| `props.messageHandlers.componentLoaded()` | **Required.** Call once when the component UI is fully ready (after data is fetched and rendered). Fires from the top-level component only. |

### 5.2 `props.searchData`

The primary data prop. Contains the structured search results resolved by the platform
when the user's query matched your component's keywords or regex patterns.

```js
props.searchData  // array or object of resolved search results
```

Use this as your main data source for rendering content.

### 5.3 `props.queryProps`

Structured query data extracted from the user's search — shape matches `resource.json` (if configured).

```js
props.queryProps  // object matching your resource.json schema
```

### 5.4 Other notable props

| Prop | Description |
|------|-------------|
| `props.searchQuery` | The raw user search string |
| `props.format` | `"mainline"` or `"sidebar"` — the render context |
| `props.theme` | Theme object (colors, etc.) from the platform |

---

## 5. Routing

`withHD` provides a `BrowserRouter` automatically.  
**Do NOT add another `<BrowserRouter>`** — it will break routing.

Use `<Routes>` / `<Route>` directly inside your component:

```jsx
import { Routes, Route } from 'react-router-dom';

function MyComponent(props) {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/details/:id" element={<DetailsPage />} />
    </Routes>
  );
}
```

The `baseURL` set in `hyperdart.config.js` (`client.baseURL`) is the root path
for your component inside the Dart Frame. Sub-routes extend from that base.

---

## 6. Mainline vs Sidebar

Your component can render in two contexts (controlled by `hyperdart.config.js → format`):

| Context | `props.format` value | Typical width | Notes |
|---------|---------------------|---------------|-------|
| Mainline | `"mainline"` | Full width | Rich, detailed view |
| Sidebar | `"sidebar"` | ~320–400 px | Compact summary view |

Use `props.format` to conditionally render a compact vs. full layout.

---

## 7. Development Workflow

```bash
# Install
npm install

# Start local sandbox (opens http://localhost:5173)
npm run dev

# The sandbox at /sandbox simulates the platform iframe
# Your component is served at /<package-name>

# Build for production
npm run build

# Validate before publish
npm run validate
```

---

## 8. AI Generation Rules

When generating or modifying code in this project, always follow these rules:

1. **Never change** `src/sandbox/`, `vite.config.js`, `index.html`, or `scripts/`.
2. **Always keep** `withHD` wrapping in `src/frontend/index.jsx`.
3. **Never add** a second `<BrowserRouter>`.
4. New sub-components go in `src/frontend/` alongside `NewComponent.jsx`.
5. Use `props.queryProps` to drive data — never hardcode search-dependent values.
6. `hyperdart.config.js` `name`, `client.location`, and `client.moduleName` are **read-only** — derive from `package.json`.
7. `searchData.json` is for **local testing only** — do not use it as a data source in component logic.
