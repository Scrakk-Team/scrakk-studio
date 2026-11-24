// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencia "modo compacto" del chrome (lógica pura, sin DOM real). */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
const html = {
  setAttribute: vi.fn(),
  removeAttribute: vi.fn()
}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})
vi.stubGlobal('document', { documentElement: html })

const {
  isCompactChromeEnabled,
  setCompactChromeEnabled,
  isExtraBordersEnabled,
  setExtraBordersEnabled,
  subscribeToCompactChrome,
  installCompactChrome,
  _resetCompactChromeForTests
} = await import('../src/renderer/src/services/compactChrome')

beforeEach(() => {
  store.clear()
  html.setAttribute.mockClear()
  html.removeAttribute.mockClear()
  _resetCompactChromeForTests()
})

describe('compact chrome', () => {
  it('está desactivado por defecto', () => {
    expect(isCompactChromeEnabled()).toBe(false)
  })

  it('persiste y publica el atributo en <html>', () => {
    const listener = vi.fn()
    const off = subscribeToCompactChrome(listener)
    setCompactChromeEnabled(true)
    expect(isCompactChromeEnabled()).toBe(true)
    expect(store.get('scrakk-studio:compact-chrome')).toBe('1')
    expect(html.setAttribute).toHaveBeenCalledWith('data-compact-chrome', '')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('al desactivar quita el atributo (layout default intacto)', () => {
    setCompactChromeEnabled(true)
    setCompactChromeEnabled(false)
    expect(store.get('scrakk-studio:compact-chrome')).toBe('0')
    expect(html.removeAttribute).toHaveBeenCalledWith('data-compact-chrome')
  })

  it('bordes extra: desactivados por defecto y persisten su propia clave', () => {
    expect(isExtraBordersEnabled()).toBe(false)
    setExtraBordersEnabled(true)
    expect(isExtraBordersEnabled()).toBe(true)
    expect(store.get('scrakk-studio:compact-extra-borders')).toBe('1')
    expect(html.setAttribute).toHaveBeenCalledWith('data-extra-borders', '')
    setExtraBordersEnabled(false)
    expect(html.removeAttribute).toHaveBeenCalledWith('data-extra-borders')
  })

  it('installCompactChrome refleja la preferencia al arrancar', () => {
    store.set('scrakk-studio:compact-chrome', '1')
    // El módulo ya leyó el valor al importarse; forzamos el estado guardado.
    setCompactChromeEnabled(true)
    html.setAttribute.mockClear()
    const cleanup = installCompactChrome()
    expect(html.setAttribute).toHaveBeenCalledWith('data-compact-chrome', '')
    cleanup()
    expect(html.removeAttribute).toHaveBeenCalledWith('data-compact-chrome')
  })
})
