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
