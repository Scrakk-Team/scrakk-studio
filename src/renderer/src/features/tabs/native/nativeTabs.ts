// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
//
// Bridge entre el strip de tabs nativo (Innerta C++ -> WASM) y Scrakk.
// Cada llamada a `createNativeTabs()` instancia un MÓDULO SEPARADO: cada strip
// tiene su propio estado (tabs, activa, hover, scroll, drag).

import createTabs from './tabs.js'

interface NativeModule {
  _malloc(size: number): number
  _free(ptr: number): void
  stringToUTF8(str: string, ptr: number, maxBytes: number): void
  UTF8ToString(ptr: number): string
  _tabs_set_tabs(ptr: number): void
  _tabs_set_label_width(index: number, px: number): void
  _tabs_count(): number
  _tabs_active(): number
  _tabs_id(index: number): number
  _tabs_label(index: number): number
  _tabs_flags(index: number): number
  _tabs_row_left(index: number): number
  _tabs_row_width(index: number): number
  _tabs_total_width(): number
  _tabs_scroll_x(): number
  _tabs_set_viewport(w: number, h: number): void
  _tabs_scroll(delta: number): void
  _tabs_hit(x: number, y: number): number
  _tabs_hit_index(): number
  _tabs_hit_kind(): number
  _tabs_hover(x: number, y: number): void
  _tabs_hovered(): number
  _tabs_drag_begin(index: number, x: number, y: number): void
  _tabs_drag_move(x: number, y: number): void
  _tabs_drag_end(): number
  _tabs_drag_active(): number
  _tabs_drag_index(): number
  _tabs_drag_dx(): number
  _tabs_take_reorder(): number
  _tabs_reorder_from(): number
  _tabs_reorder_to(): number
  _tabs_set_fixed_width(px: number): void
  _tabs_clear_fixed_width(): void
}

export interface NativeTabData {
  id: string
  label: string
  /** bits: 1 activa, 2 cerrable, 4 fija, 8 borrada, 16 dirty. */
  flags: number
  labelWidth?: number
}

export interface NativeTabs {
  setTabs(tabs: NativeTabData[]): void
  setLabelWidth(index: number, px: number): void
  count(): number
  active(): number
  id(index: number): string
  label(index: number): string
  flags(index: number): number
  rowLeft(index: number): number
  rowWidth(index: number): number
  totalWidth(): number
  scrollX(): number
  setViewport(w: number, h: number): void
  scroll(delta: number): void
  hit(x: number, y: number): number
  hitIndex(): number
  hitKind(): number
  hover(x: number, y: number): void
  hovered(): number
  dragBegin(index: number, x: number, y: number): void
  dragMove(x: number, y: number): void
  dragEnd(): boolean
  dragActive(): boolean
  dragIndex(): number
  dragDx(): number
  takeReorder(): boolean
  reorderFrom(): number
  reorderTo(): number
  setFixedWidth(px: number): void
  clearFixedWidth(): void
}

function allocString(mod: NativeModule, s: string): number {
  const bytes = new TextEncoder().encode(s).length + 1
  const ptr = mod._malloc(bytes)
  mod.stringToUTF8(s, ptr, bytes)
  return ptr
}

export async function createNativeTabs(): Promise<NativeTabs> {
  const mod = (await createTabs()) as NativeModule

  return {
    setTabs(tabs) {
      const data = tabs
        .map((tab) => `${tab.id}\t${tab.label}\t${tab.flags}\t${tab.labelWidth ?? 0}`)
        .join('\n')
      const ptr = allocString(mod, data)
      mod._tabs_set_tabs(ptr)
      mod._free(ptr)
    },
    setLabelWidth: (index, px) => mod._tabs_set_label_width(index, px),
    count: () => mod._tabs_count(),
    active: () => mod._tabs_active(),
    id: (i) => mod.UTF8ToString(mod._tabs_id(i)),
    label: (i) => mod.UTF8ToString(mod._tabs_label(i)),
    flags: (i) => mod._tabs_flags(i),
    rowLeft: (i) => mod._tabs_row_left(i),
    rowWidth: (i) => mod._tabs_row_width(i),
    totalWidth: () => mod._tabs_total_width(),
    scrollX: () => mod._tabs_scroll_x(),
    setViewport: (w, h) => mod._tabs_set_viewport(w, h),
    scroll: (delta) => mod._tabs_scroll(delta),
    hit: (x, y) => mod._tabs_hit(x, y),
    hitIndex: () => mod._tabs_hit_index(),
    hitKind: () => mod._tabs_hit_kind(),
    hover: (x, y) => mod._tabs_hover(x, y),
    hovered: () => mod._tabs_hovered(),
    dragBegin: (i, x, y) => mod._tabs_drag_begin(i, x, y),
    dragMove: (x, y) => mod._tabs_drag_move(x, y),
    dragEnd: () => mod._tabs_drag_end() !== 0,
    dragActive: () => mod._tabs_drag_active() !== 0,
    dragIndex: () => mod._tabs_drag_index(),
    dragDx: () => mod._tabs_drag_dx(),
    takeReorder: () => mod._tabs_take_reorder() !== 0,
    reorderFrom: () => mod._tabs_reorder_from(),
    reorderTo: () => mod._tabs_reorder_to(),
    setFixedWidth: (px) => mod._tabs_set_fixed_width(px),
    clearFixedWidth: () => mod._tabs_clear_fixed_width()
  }
}
