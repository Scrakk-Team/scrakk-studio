// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
//
// Bridge between the native explorer (Innerta C++ -> WASM) and Scrakk.
// Each call to `createNativeExplorer()` instantiates a SEPARATE WASM module,
// so the sidebar and every explorer tab own independent state (tree, hover,
// scroll, inline rename). No shared singleton.

import { api } from '@services/api'
import { openFileInEditor } from '@features/editor'
import createExplorer from './explorer.js'

const enc = new TextEncoder()

interface NativeModule {
  _malloc(size: number): number
  _free(ptr: number): void
  stringToUTF8(str: string, ptr: number, maxBytes: number): void
  UTF8ToString(ptr: number): string
  _explorer_open(ptr: number): void
  _explorer_close(): void
  _explorer_is_open(): number
  _explorer_set_dir_entries(pathPtr: number, dataPtr: number): void
  _explorer_row_count(): number
  _explorer_row_path(i: number): number
  _explorer_row_name(i: number): number
  _explorer_row_level(i: number): number
  _explorer_row_flags(i: number): number
  _explorer_set_viewport(w: number, h: number): void
  _explorer_content_height(): number
  _explorer_scroll_y(): number
  _explorer_set_scroll(y: number): void
  _explorer_scroll(dy: number): void
  _explorer_tick(dt: number): void
  _explorer_set_hover(x: number, y: number): void
  _explorer_click(x: number, y: number): number
  _explorer_click_index(idx: number): number
  _explorer_click_index_mode(idx: number, mode: number): number
  _explorer_last_clicked_path(): number
  _explorer_clear_selection(): void
  _explorer_set_selection(pathPtr: number): void
  _explorer_selection_count(): number
  _explorer_selection_path(i: number): number
  _explorer_lasso_begin(x: number, y: number, additive: number): void
  _explorer_lasso_update(x: number, y: number): void
  _explorer_lasso_end(): void
  _explorer_lasso_active(): number
  _explorer_lasso_count(): number
  _explorer_lasso_path(i: number): number
  _explorer_lasso_x(): number
  _explorer_lasso_y(): number
  _explorer_lasso_w(): number
  _explorer_lasso_h(): number
  _explorer_lasso_take_scroll(): number
  _explorer_needs_dir(ptr: number): number
  _explorer_expand_all(skipFiles: number): void
  _explorer_expand_path(pathPtr: number): void
  _explorer_rebuild(): void
  _explorer_set_hide_files(hide: number): void
  _explorer_clear_expanded(): void
  _explorer_collapse_all(): void
  _explorer_begin_rename(pathPtr: number, initialPtr: number): void
  _explorer_cancel_rename(): void
  _explorer_editing_path(): number
  _explorer_edit_value(): number
  _explorer_edit_row(): number
  _explorer_edit_caret(): number
  _explorer_edit_anchor(): number
  _explorer_edit_set_caret(caret: number, extend: number): void
  _explorer_edit_select_all(): void
  _explorer_edit_insert(textPtr: number): void
  _explorer_edit_append(textPtr: number): void
  _explorer_edit_backspace(): void
  _explorer_edit_delete(): void
  _explorer_edit_move(dir: number, extend: number): void
  _explorer_edit_home(extend: number): void
  _explorer_edit_end(extend: number): void
  _explorer_edit_selected_text(): number
  _explorer_edit_scroll(): number
  _explorer_edit_follow(caretX: number, boxW: number): void
  _explorer_edit_caret_visible(): number
}

export interface NativeRow {
  path: string
  name: string
  level: number
  isDir: boolean
  expanded: boolean
  hovered: boolean
  selected: boolean
  /** Selected and the row above is selected too (flatten top corners). */
  mergeTop: boolean
  /** Selected and the row below is selected too (flatten bottom corners). */
  mergeBottom: boolean
}

export interface NativeExplorer {
  setDir(path: string): Promise<void>
  open(root: string): Promise<void>
  close(): void
  rowCount(): number
  rows(start?: number, count?: number): NativeRow[]
  hover(x: number, y: number): void
  /** mode: 0 single, 1 ctrl/cmd toggle, 2 shift range. Resolves to 0/1/2. */
  clickIndex(idx: number, mode?: number): Promise<number>
  clearSelection(): void
  setSelection(paths: string[]): void
  selection(): string[]
  lassoBegin(x: number, y: number, additive: boolean): void
  lassoUpdate(x: number, y: number): void
  lassoEnd(): void
  lassoActive(): boolean
  lassoPaths(): string[]
  lassoRect(): { x: number; y: number; w: number; h: number }
  takeLassoScroll(): number
  scrollY(): number
  setScroll(y: number): void
  tick(dt: number): void
  contentHeight(): number
  setViewport(w: number, h: number): void
  expandAllProgressive(root: string, skipFiles: boolean): Promise<void>
  collapseAll(): void
  beginRename(path: string, initial: string): void
  cancelRename(): void
  editingPath(): string
  editValue(): string
  editAppend(text: string): void
  editBackspace(): void
  // Native text editing (caret + selection live in the C++ core).
  editRow(): number
  caret(): number
  anchor(): number
  setCaret(caret: number, extend?: boolean): void
  selectAll(): void
  editInsert(text: string): void
  editDelete(): void
  editMove(dir: -1 | 1, extend?: boolean): void
  editHome(extend?: boolean): void
  editEnd(extend?: boolean): void
  selectedText(): string
  editScroll(): number
  followCaret(caretX: number, boxW: number): void
  caretVisible(): boolean
}

function allocString(mod: NativeModule, s: string): number {
  const size = enc.encode(s).length + 1
  const ptr = mod._malloc(size)
  mod.stringToUTF8(s, ptr, size)
  return ptr
}

const EXPAND_BATCH = 16

export async function createNativeExplorer(): Promise<NativeExplorer> {
  const mod = (await createExplorer()) as NativeModule

  const cacheDir = async (
    path: string
  ): Promise<Array<{ name: string; is_directory: boolean }>> => {
    const res = await api.fs.readdir(path)
    const entries = res.success ? res.entries : []
    const lines: string[] = []
    for (const e of entries) {
      const full = path.endsWith('/') ? `${path}${e.name}` : `${path}/${e.name}`
      lines.push(`${e.name}\t${full}\t${e.is_directory ? 1 : 0}`)
    }
    const pPath = allocString(mod, path)
    const pData = allocString(mod, lines.join('\n'))
    mod._explorer_set_dir_entries(pPath, pData)
    mod._free(pPath)
    mod._free(pData)
    return entries
  }

  const setDir = async (path: string): Promise<void> => {
    await cacheDir(path)
  }

  const open = async (root: string): Promise<void> => {
    await setDir(root)
    const p = allocString(mod, root)
    mod._explorer_open(p)
    mod._free(p)
  }

  const rows = (start = 0, count = -1): NativeRow[] => {
    const total = mod._explorer_row_count()
    const from = Math.max(0, Math.min(start, total))
    const to = count < 0 ? total : Math.min(total, from + count)
    const out: NativeRow[] = []
    for (let i = from; i < to; i++) {
      const flags = mod._explorer_row_flags(i)
      out.push({
        path: mod.UTF8ToString(mod._explorer_row_path(i)),
        name: mod.UTF8ToString(mod._explorer_row_name(i)),
        level: mod._explorer_row_level(i),
        isDir: (flags & 1) !== 0,
        expanded: (flags & 2) !== 0,
        hovered: (flags & 4) !== 0,
        selected: (flags & 8) !== 0,
        mergeTop: (flags & 16) !== 0,
        mergeBottom: (flags & 32) !== 0
      })
    }
    return out
  }

  const clickIndex = async (idx: number, mode = 0): Promise<number> => {
    const action = mod._explorer_click_index_mode(idx, mode)
    if (action === 2) {
      const path = mod.UTF8ToString(mod._explorer_last_clicked_path())
      const name = path.split(/[/\\]/).pop() ?? path
      openFileInEditor(path, name)
    }
    return action
  }

  const selection = (): string[] => {
    const count = mod._explorer_selection_count()
    const out: string[] = []
    for (let i = 0; i < count; i++) out.push(mod.UTF8ToString(mod._explorer_selection_path(i)))
    return out
  }

  const lassoPaths = (): string[] => {
    const count = mod._explorer_lasso_count()
    const out: string[] = []
    for (let i = 0; i < count; i++) out.push(mod.UTF8ToString(mod._explorer_lasso_path(i)))
    return out
  }

  const expandAllProgressive = async (
    root: string,
    skipFiles: boolean
  ): Promise<void> => {
    mod._explorer_set_hide_files(skipFiles ? 1 : 0)
    const seen = new Set<string>()
    const queue: string[] = [root]
    let processed = 0

    while (queue.length > 0) {
      const path = queue.shift() as string
      if (seen.has(path)) continue
      seen.add(path)

      const entries = await cacheDir(path)
      if (path !== root) {
        const p = allocString(mod, path)
        mod._explorer_expand_path(p)
        mod._free(p)
      }
      for (const e of entries) {
        if (!e.is_directory) continue
        const full = path.endsWith('/') ? `${path}${e.name}` : `${path}/${e.name}`
        if (!seen.has(full)) queue.push(full)
      }

      processed += 1
      if (processed % EXPAND_BATCH === 0) {
        mod._explorer_rebuild()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    mod._explorer_rebuild()
  }

  return {
    setDir,
    open,
    close: () => mod._explorer_close(),
    rowCount: () => mod._explorer_row_count(),
    rows,
    hover: (x, y) => mod._explorer_set_hover(x, y),
    clickIndex,
    clearSelection: () => mod._explorer_clear_selection(),
    setSelection: (paths) => {
      const p = allocString(mod, paths.join('\n'))
      mod._explorer_set_selection(p)
      mod._free(p)
    },
    selection,
    lassoBegin: (x, y, additive) => mod._explorer_lasso_begin(x, y, additive ? 1 : 0),
    lassoUpdate: (x, y) => mod._explorer_lasso_update(x, y),
    lassoEnd: () => mod._explorer_lasso_end(),
    lassoActive: () => mod._explorer_lasso_active() !== 0,
    lassoPaths,
    lassoRect: () => ({
      x: mod._explorer_lasso_x(),
      y: mod._explorer_lasso_y(),
      w: mod._explorer_lasso_w(),
      h: mod._explorer_lasso_h()
    }),
    takeLassoScroll: () => mod._explorer_lasso_take_scroll(),
    scrollY: () => mod._explorer_scroll_y(),
    tick: (dt) => mod._explorer_tick(dt),
    setScroll: (y) => mod._explorer_set_scroll(y),
    contentHeight: () => mod._explorer_content_height(),
    setViewport: (w, h) => mod._explorer_set_viewport(w, h),
    expandAllProgressive,
    collapseAll: () => mod._explorer_collapse_all(),
    beginRename: (path, initial) => {
      const p = allocString(mod, path)
      const v = allocString(mod, initial)
      mod._explorer_begin_rename(p, v)
      mod._free(p)
      mod._free(v)
    },
    cancelRename: () => mod._explorer_cancel_rename(),
    editingPath: () => mod.UTF8ToString(mod._explorer_editing_path()),
    editValue: () => mod.UTF8ToString(mod._explorer_edit_value()),
    editAppend: (text) => {
      const p = allocString(mod, text)
      mod._explorer_edit_append(p)
      mod._free(p)
    },
    editBackspace: () => mod._explorer_edit_backspace(),
    editRow: () => mod._explorer_edit_row(),
    caret: () => mod._explorer_edit_caret(),
    anchor: () => mod._explorer_edit_anchor(),
    setCaret: (caret, extend = false) =>
      mod._explorer_edit_set_caret(caret, extend ? 1 : 0),
    selectAll: () => mod._explorer_edit_select_all(),
    editInsert: (text) => {
      const p = allocString(mod, text)
      mod._explorer_edit_insert(p)
      mod._free(p)
    },
    editDelete: () => mod._explorer_edit_delete(),
    editMove: (dir, extend = false) =>
      mod._explorer_edit_move(dir, extend ? 1 : 0),
    editHome: (extend = false) => mod._explorer_edit_home(extend ? 1 : 0),
    editEnd: (extend = false) => mod._explorer_edit_end(extend ? 1 : 0),
    selectedText: () => mod.UTF8ToString(mod._explorer_edit_selected_text()),
    editScroll: () => mod._explorer_edit_scroll(),
    followCaret: (caretX, boxW) => mod._explorer_edit_follow(caretX, boxW),
    caretVisible: () => mod._explorer_edit_caret_visible() !== 0
  }
}
