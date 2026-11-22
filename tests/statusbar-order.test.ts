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
  DEFAULT_LEFT, DEFAULT_RIGHT, getStatusLeft, getStatusRight,
  moveStatusBarItem, resetStatusBarOrder, subscribeToStatusBarOrder
} = await import('../src/renderer/src/features/statusbar/order')

beforeEach(() => {
  store.clear()
  resetStatusBarOrder()
})

describe('status bar order', () => {
  it('empieza en el orden por defecto (izq y der separados)', () => {
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(getStatusRight()).toEqual([...DEFAULT_RIGHT])
  })

  it('reordena items de la izquierda', () => {
    moveStatusBarItem('problems', 'lsp', true)
    const order = getStatusLeft()
    expect(order.indexOf('problems')).toBe(order.indexOf('lsp') - 1)
  })

  it('reordena items de la derecha SIN sacarlos del grupo', () => {
    moveStatusBarItem('settings', 'layout', true)
    const order = getStatusRight()
    expect(order.indexOf('settings')).toBe(order.indexOf('layout') - 1)
    expect(getStatusLeft()).toEqual([...DEFAULT_LEFT])
    expect(order).not.toContain('sep-right') // el separador está fuera
  })

  it('no mezcla grupos', () => {
    moveStatusBarItem('settings', 'lsp', true)
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
