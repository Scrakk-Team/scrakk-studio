// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencias experimentales de la Activity Bar (lógica pura, sin DOM). */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})

const {
  getActivityBarMode,
  setActivityBarMode,
  getDisabledActivitySide,
  setDisabledActivitySide,
  subscribeToActivityBarSettings,
  normalizeActivityBarMode,
  normalizeDisabledSide,
  _resetActivityBarSettingsForTests
} = await import('../src/renderer/src/services/activityBarSettings')

beforeEach(() => {
  store.clear()
  _resetActivityBarSettingsForTests()
})

describe('activity bar mode', () => {
  it('empieza en default', () => {
    expect(getActivityBarMode()).toBe('default')
  })

  it('acepta los tres modos y persiste', () => {
    for (const mode of ['centered', 'wheel', 'default'] as const) {
      setActivityBarMode(mode)
      expect(getActivityBarMode()).toBe(mode)
    }
    expect(store.get('scrakk-studio:activitybar-mode')).toBe('default')
  })

  it('normaliza valores inválidos', () => {
    expect(normalizeActivityBarMode('wheel')).toBe('wheel')
    expect(normalizeActivityBarMode('otro')).toBe('default')
    expect(normalizeActivityBarMode(null)).toBe('default')
  })
})

describe('disabled activity side', () => {
  it('empieza en none', () => {
    expect(getDisabledActivitySide()).toBe('none')
  })

  it('sólo puede haber UNA desactivada: cambiar de lado reemplaza el anterior', () => {
    setDisabledActivitySide('left')
    expect(getDisabledActivitySide()).toBe('left')
    setDisabledActivitySide('right')
    expect(getDisabledActivitySide()).toBe('right')
    setDisabledActivitySide('none')
    expect(getDisabledActivitySide()).toBe('none')
    expect(store.get('scrakk-studio:activitybar-disabled-side')).toBe('none')
  })

  it('normaliza valores inválidos', () => {
    expect(normalizeDisabledSide('right')).toBe('right')
    expect(normalizeDisabledSide('both')).toBe('none')
  })
})

describe('suscripción', () => {
  it('notifica un único cambio aunque el valor no cambie', () => {
    const listener = vi.fn()
    const off = subscribeToActivityBarSettings(listener)
    setActivityBarMode('default')
    expect(listener).not.toHaveBeenCalled()
    setActivityBarMode('wheel')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })
})
