---
title: "Breadcrumbs"
group: features
order: 200
summary: "The path bar above the editor: how it resolves the workspace root and file, what each segment shows, and its click dropdowns."
---
# Breadcrumbs

**Breadcrumbs** are the strip shown above the editor content
(`features/breadcrumbs/BreadcrumbsBar.tsx`). It reads `root > folder > … > file`
and, when the cursor is inside a symbol from the parser tree, appends the
symbol chain (`file.ts > Class > method`). Each segment with an icon can open an
anchored dropdown: the path levels show the Explorer listing, and the symbol
levels show the symbols at that level.

The editor mounts one per file tab:

```tsx
// features/layout/components/TabContentView/TabContentView.tsx
<BreadcrumbsBar key={`crumbs-${spec.id}`} path={spec.filePath} />
```

## Props

| Prop | Default | Meaning |
|---|---|---|
| `root` | workspace root | Context root for the path |
| `path` | active editor file | File to show |
| `interactive` | `true` | `false` renders read-only segments (dropdowns disabled) |
| `onNavigate` | `openFileInEditor` | Called with `(path, name)` when a file is picked |
| `showIcons` | `true` | Show per-segment icons |

When `root` or `path` is not passed, the component falls back to its hooks.
`useWorkspaceRoot` reads `scrakk-studio:root-path` from local storage and updates
on the `workspace-changed` event (using `detail.path`); `useActivePath` follows
`getEditorFiles().activePath` through `subscribeToEditorFiles`.

## How the path is built

`buildSegments(root, filePath)` (`features/breadcrumbs/segments.ts`) is a pure
function, testable without React:

- No file → empty list (the bar renders `null`).
- No root, or a file **outside** the root → a single segment with the file's
  base name.
- Inside the root → a root segment (`isRoot: true`) named after the root folder,
  then one segment per path part; the last is marked `isFile`.
- Paths are normalised: backslashes become `/`, trailing slashes are trimmed.

Each `CrumbSegment` has `name`, `path`, `isFile` and `isRoot`.

## Symbol breadcrumbs

After the file segment, the bar appends the AST chain that contains the cursor
line. The data comes from the dynamic tree-sitter parser (`tags.scm`) through
`@services/extensions/dynamicSyntax`; there is no regex fallback because the
regex extractor does not expose reliable end lines:

```ts
const { symbols, line } = useEditorSymbols(activePath)
const crumbs = buildSymbolCrumbs(symbols, line)
```

`buildSymbolCrumbs` (`features/breadcrumbs/symbols.ts`) walks the symbol tree and
keeps the children whose `line`/`endLine` range contains the cursor. It returns
the symbol and its sibling level for each depth. When the cursor is outside every
symbol, the chain is empty and the bar keeps showing only the path.

The cursor comes from `features/editor/cursorBus.ts`. `EditorCursor` carries an
optional `path`, which the Innerta bridge fills with the file that owns the
editor. A breadcrumb only uses the cursor when that path matches its own file, so
inactive tabs and split editors keep their path-only bar.

## Rendering

The bar is a `<nav>` with each segment separated by a `chevron-right` icon. The
icon depends on the segment kind:

- root → `folder-opened`
- folder → `folder`
- file → `FileTypeIcon` (the same file-icon theme used by the
  [Explorer](explorer.md))
- symbol → the `SymbolIcons` glyph/colour used by the
  [Outline](outline.md)

The active file segment uses the `segmentFile` style. The button's `title` is the
full absolute path.

## Click behaviour

Clicking a path segment calls `openLevel`:

1. It computes the directory to list — the segment path itself for a folder, or
   the parent directory for a file.
2. It opens an anchored modal under `key: 'breadcrumbs-level'` with
   `placement: 'below'`, `align: 'center'` and `width: 300`.
3. The modal renders `ExplorerView` for that directory with `interactive={false}`.
4. Selecting a file calls `navigate(path, name)` (default `openFileInEditor`)
   then closes the dropdown.

Clicking a symbol segment opens `key: 'breadcrumbs-symbol'` with the siblings at
that level. The list reuses `ExplorerItemsView`, so every row is the same
`ExplorerRow` (height, hover, selection, ellipsis and icon layout) as the real
Explorer tree. Picking a symbol calls
`revealInnertaPosition(path, symbol.line, 0)` and closes the dropdown; moving the
cursor updates the breadcrumb normally.

Clicking the **same** level again toggles it closed; clicking a different level
closes the previous dropdown and opens the new one. Path and symbol dropdowns
are mutually exclusive. When `interactive` is `false`, the buttons are disabled
and no dropdown opens.

## Limits

- The bar reflects the workspace root from local storage; a file outside that
  root collapses to a single file segment with no intermediate folders.
- Symbol crumbs need an installed language extension that ships a `.wasm`
  parser and `tags.scm`. Without it, the bar shows only the path.
- Only the focused editor gets symbol crumbs; an inactive split keeps the path.
- The path dropdown is a read-only Explorer view: it opens files, but there is no
  rename/new-file/context-menu action inside it.
- The strip is part of the editor tab view, so it disappears when the tab is not
  the centre content.

## Next steps

- [Explorer](explorer.md) — the file tree behind the dropdowns.
- [Outline](outline.md) — the full symbol tree of the active file.
- [Layout & panels](layout.md) — where the editor tab view is mounted.
- [File timeline](file-timeline.md) — a related per-file view in the tool dock.
- [Panels & features](README.md) — the other built-in areas.
