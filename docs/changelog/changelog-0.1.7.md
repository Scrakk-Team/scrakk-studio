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
