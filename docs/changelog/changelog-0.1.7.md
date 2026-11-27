---
title: "Changelog 0.1.7"
group: changelog
order: 50
summary: "Relevant changes in Scrakk Studio. The welcome screen shows the first entry (the newest) in the Announcements section, so the newest goes on top."
---
# Changelog

Relevant changes in Scrakk Studio. The **welcome screen** shows the first
entry (the newest) in the **Announcements** section, so the newest goes on top.

Format: `## <version> — <title>` and bullets per area. Entries already
published are not edited. The file goes per version:
`docs/changelog/changelog-<x.y.z>.md`.

---

## 0.1.7 — Compact mode for the whole chrome

### Tabs (native / experimental)
- **Tab strips can now be drawn by a native C++/WASM module, in the same
  container.** The React `TabStrip` is kept intact as a fallback; the
  Experimental preference "Native tabs (WASM)" swaps its tab list for a canvas
  inside that exact container. The rendering reproduces Scrakk's real tab UI
  (radius from the theme's `--radius-sm`, active background/underline, hover,
  close button and dirty dot, deleted styling, fixed-width mode) with the same
  padding, gaps and icon sizes as the React strip, so tabs start at the same x
  and the welcome tab has the same minimum width. The active tab never takes
  the hover or drag feedback. The close X is the same `x` ProductIcon as
  Scrakk, and the welcome label comes from i18n. Dragging a tab now reorders
  the strip live: the dragged tab follows the pointer horizontally, clamped to
  the container, is painted above the others, and neighbours shift as you
  cross their midpoint (browser-tab behaviour). Switching tabs is immediate:
  the pointerdown activates the already-loaded Innerta buffer synchronously
  (`activateFileSessionNow`) instead of waiting for a React effect and
  `engine.whenReady()`, so the C++→C++ switch happens in the same input event.
  Theme changes repaint the native canvas immediately from the `theme-changed`
  event (colors and `--radius-sm`), with no React re-render in between. Drag
  was polished: a data push during the gesture no longer cancels it, and the
  dragged tab stays under the pointer when neighbours shift (no jumps). The
  editor host no longer unmounts on every tab change (`FileTabView` is keyed
  per strip) and the session is attached in a layout effect, so the native
  buffer switched at pointerdown is visible in the same frame. The native
  core also activates the highlight itself (`tabs_set_active`) in that same
  call, and repaints synchronously, so neither the tab nor the editor waits for
  a store roundtrip or an animation frame. Tab widths are measured with the
  theme's real `--text-sm`/`--font-sans` (so they follow the file name/title
  length), header-title changes re-measure them, and identical snapshots are
  not re-uploaded to WASM.
- **Instant tab switching inside Innerta.** Switching to an already-prepared
  session now only calls `activateSession` and clears the previous file's
  decorations; it no longer re-pushes the whole theme, re-reads the buffer into
  JS, or restarts the semantic/grammar/tree-sitter highlight pipelines. Those
  expensive channels are deferred to idle after the switch. The first
  activation of a session still does the full setup, and renames transfer the
  "prepared" state.
  Icons use the native explorer's pipeline
  (file-icon themes + ProductIcons rasterized to images). The core owns layout, hit-testing, hover, wheel scroll
  and same-strip drag reorder; `tabsStore` stays the source of truth. Snapshots
  are pushed only on state changes and painting is frame-coalesced, so pointer
  movement never re-uploads the tab list (no lag). One WASM instance per strip.
  The module is shipped prebuilt; no build command is exposed publicly.

### Shortcuts
- **Quick tab switching with `Ctrl+Tab` / `Ctrl+Shift+Tab`.** Registered as
  regular commands (`tabs.next`, `tabs.previous`) through `commandRegistry`, so
  the combos are reassignable in Settings → Shortcuts and present in the three
  keymap presets. The commands cycle the tabs of the active strip with
  wrap-around; the definitions and the neighbour math are pure data, with no
  hardcoded handler in any component. Shortcuts are now resolved in the
  **capture phase** and mark the keyboard event as consumed; Innerta checks
  that flag and never delivers a consumed key to the engine, so `Ctrl+Tab`
  changes tabs without inserting a tab/indent in the buffer. Commands can
  declare `preventDefault` for exactly this.

### Icons (icon themes)
- **Problems, Bookmarks and the workspace switcher now follow the active icon
  theme.** These panels kept their header glyphs frozen when an extension
  theme was selected. They now re-render on `subscribeToProductIcons`, and
  semantic aliases (`file`, `folder`, `alert`, `close`, `info`, `plus`, …) map
  app ids to the names icon themes actually use (`symbol-file`, `warning`,
  `new-file`, …), so their icons change together with the rest of the chrome.

### Editor tabs
- **A new file from the Welcome page is selected in the native explorer.**
  File creation publishes a reveal request that the explorer consumes when it
  is mounted, so the new row is selected (and its ancestors expanded) instead
  of only opening a tab in the editor. The native tree is re-opened from disk
  before selecting — `g.roots` is filled at `explorer_open` and otherwise never
  sees files created later — while preserving the folders already expanded.
- **Renaming a file renames its open tab in place.** The tab id, path and label
  change together with the editor's open-file list and the live editor session,
  without recreating the tab or saving the content to a second file with the
  old name. The active file keeps focus.
- **Deleted files show a deleted tab.** The tab stays open but its name is
  drawn in red, italic and crossed out with a red line through the middle.

### Explorer (native)
- **New file / New folder now use the native inline rename input.** Both the
  panel header buttons and the context menu actions create the item with a
  temporary unique name, refresh the native WASM tree and start the same
  `beginRename` the F2/rename action uses, so you type the name in the row
  itself instead of getting an `untitled.txt` tab. The header buttons use the
  native selection as the destination: a selected folder creates inside it, a
  selected file creates beside it. "New file" inside a folder expands that
  folder in the native core so the new row is visible. Refreshing the tree no
  longer collapses the folders you had open: expanded state, selection and
  scroll are captured before the native reopen and restored after it (the core
  resets its state on `explorer_open`). Renaming still performs the real
  `moveFile` on commit; cancelling (Escape or a blank name) deletes the
  temporary item instead of leaving it behind.

### Chrome (experimental)
- **One toggle for the whole chrome.** Settings → Experimental has a new
  **Compact mode**: it removes the inset and the floating-card look from the
  layout and leaves a single 1px divider between panels, like VS Code. It
  applies to panels, titlebar, statusbar and activity bars at the same time.
  The default separated-panel layout is untouched — the mode only publishes a
  `data-compact-chrome` attribute on `<html>`, and scoped CSS overrides do the
  rest — so switching it off restores exactly the previous look. The window's
  rounded corners stay, and dividers use the theme's `--chrome-border` token.
  Resize handles keep a 4px grab area while drawing only the 1px line. The
  dividers are drawn by the handles alone: panel, split-leaf and split-pane
  borders are all suppressed in this mode so the line never looks doubled or
  thicker than 1px.
- **"Extra borders" sub-option.** Only available with Compact mode on, it draws
  a visible border on the side of each activity bar facing the panels, plus the
  titlebar and statusbar edges. It shares one token with the panel headers
  (`--panel-header-border`, derived from the theme's `--color-border`), so the
  divider, the extra borders and the header lines are exactly the same color,
  and it is fully localised.
