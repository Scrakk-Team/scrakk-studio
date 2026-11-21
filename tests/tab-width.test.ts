// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Store de ancho fijo de tabs: rango, persistencia en memoria y suscripción. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})

const {
  isTabWidthFixed, getTabWidth, setTabWidthFixed, setTabWidth,
  subscribeToTabWidth, clamp, TAB_WIDTH_MIN, TAB_WIDTH_MAX,
  TAB_WIDTH_DEFAULT, _resetTabWidthForTests
} = await import('../src/renderer/src/features/tabs/tabSize')

beforeEach(() => {
  store.clear()
  _resetTabWidthForTests()
})

describe('tabSize store', () => {
  it('empieza desactivado con el ancho por defecto', () => {
    expect(isTabWidthFixed()).toBe(false)
    expect(getTabWidth()).toBe(TAB_WIDTH_DEFAULT)
  })

  it('acota el ancho al rango permitido', () => {
    expect(clamp(10)).toBe(TAB_WIDTH_MIN)
    expect(clamp(9999)).toBe(TAB_WIDTH_MAX)
    expect(clamp(155)).toBe(155)
  })

  it('notifica a los suscriptores al activar y al cambiar el ancho', () => {
    const listener = vi.fn()
    const off = subscribeToTabWidth(listener)
    setTabWidthFixed(true)
    setTabWidth(180)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(isTabWidthFixed()).toBe(true)
    expect(getTabWidth()).toBe(180)
    expect(store.get('scrakk:tabs-fixed-width')).toBe('1')
    expect(store.get('scrakk:tabs-fixed-width-px')).toBe('180')
    off()
  })
})
