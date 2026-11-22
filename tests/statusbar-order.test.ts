// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Orden arrastrable de la status bar (lógica pura, sin DOM). */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})

const {
  DEFAULT_LEFT, DEFAULT_LAYOUT, DEFAULT_RIGHT,
  getStatusLeft, getStatusLayout, getStatusRight,
  moveStatusBarItem, resetStatusBarOrder, subscribeToStatusBarOrder,
  isDragModeEnabled, setDragMode, toggleDragMode, subscribeToDragMode,
  _resetOrderForTests
} = await import('../src/renderer/src/features/statusbar/order')

beforeEach(() => {
  store.clear()
  _resetOrderForTests()
})

describe('status bar order', () => {
  it('orden por defecto: [lsp…extensiones]  espacio  [layout] | campana, ajustes', () => {
    expect(getStatusLeft()).toEqual(['lsp', 'git', 'problems', 'cursor', 'encoding', 'ext-left'])
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(getStatusLayout()).toEqual(['layout'])
    expect(getStatusLayout()).toEqual([...DEFAULT_LAYOUT])
    expect(getStatusRight()).toEqual(['bell', 'settings'])
    expect(getStatusRight()).toEqual([...DEFAULT_RIGHT])
  })

  it('reordena items de la izquierda', () => {
    moveStatusBarItem('problems', 'lsp', true)
    const order = getStatusLeft()
    expect(order.indexOf('problems')).toBe(order.indexOf('lsp') - 1)
  })

  it('reordena items de la derecha SIN sacarlos del grupo', () => {
    moveStatusBarItem('settings', 'bell', true)
    const order = getStatusRight()
    expect(order.indexOf('settings')).toBe(order.indexOf('bell') - 1)
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(order).not.toContain('sep-right')
  })

  it('no mezcla grupos', () => {
    moveStatusBarItem('settings', 'lsp', true)
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(getStatusRight()).toEqual([...DEFAULT_RIGHT])
    // `layout` no se puede arrastrar al centro/izq ni a la derecha del `|`.
    moveStatusBarItem('layout', 'lsp', true)
    moveStatusBarItem('layout', 'bell', true)
    expect(getStatusLayout()).toEqual(['layout'])
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(getStatusRight()).toEqual([...DEFAULT_RIGHT])
  })

  it('persiste y notifica', () => {
    const listener = vi.fn()
    const off = subscribeToStatusBarOrder(listener)
    moveStatusBarItem('problems', 'lsp', true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.has('scrakk:statusbar-order')).toBe(true)
    off()
  })

  it('no-op al mover sobre sí mismo', () => {
    const listener = vi.fn()
    const off = subscribeToStatusBarOrder(listener)
    moveStatusBarItem('git', 'git', true)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})

describe('status bar drag mode', () => {
  it('está desactivado por defecto', () => {
    expect(isDragModeEnabled()).toBe(false)
  })

  it('se activa/desactiva y persiste', () => {
    toggleDragMode()
    expect(isDragModeEnabled()).toBe(true)
    expect(store.get('scrakk:statusbar-drag-mode')).toBe('true')
    setDragMode(false)
    expect(isDragModeEnabled()).toBe(false)
    expect(store.get('scrakk:statusbar-drag-mode')).toBe('false')
  })

  it('notifica a los suscriptores', () => {
    const listener = vi.fn()
    const off = subscribeToDragMode(listener)
    toggleDragMode()
    expect(listener).toHaveBeenCalledTimes(1)
    setDragMode(true) // idem: no notifica
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })
})
