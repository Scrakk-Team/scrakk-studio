// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencia y parseo del tema por proyecto (lógica pura, sin DOM real). */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
})

vi.mock('../src/renderer/src/services/extensions', () => ({
  activateTheme: vi.fn(() => true),
  getActiveThemeId: vi.fn(() => 'theme-a'),
  getRegisteredTheme: vi.fn((id: string) => ({ id, extensionId: 'ext-a' })),
  subscribeToThemes: vi.fn(() => () => {})
}))
vi.mock('../src/renderer/src/services/extensions/types/themes/store', () => ({
  loadStoredActive: vi.fn(() => ({ id: 'theme-a', extensionId: 'ext-a' }))
}))
vi.mock('../src/renderer/src/services/scrakk', () => ({
  scrakkProjectRoot: vi.fn(() => '/proyecto'),
  scrakkHandle: vi.fn(() => ({
    writeJson: vi.fn().mockResolvedValue({ ok: true, data: 'ok' }),
    readJson: vi.fn().mockResolvedValue({ ok: true, data: null })
  }))
}))

const {
  isProjectThemeEnabled,
  setProjectThemeEnabled,
  subscribeToProjectTheme,
  parseProjectTheme
} = await import('../src/renderer/src/services/projectTheme')

beforeEach(() => {
  store.clear()
  setProjectThemeEnabled(false)
})

describe('per-project theme setting', () => {
  it('está desactivada por defecto', () => {
    expect(isProjectThemeEnabled()).toBe(false)
    expect(store.has('scrakk-studio:project-theme-enabled')).toBe(false)
  })

  it('se activa, persiste y notifica', () => {
    const listener = vi.fn()
    const off = subscribeToProjectTheme(listener)
    setProjectThemeEnabled(true)
    expect(isProjectThemeEnabled()).toBe(true)
    expect(store.get('scrakk-studio:project-theme-enabled')).toBe('1')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('se desactiva y vuelve a persistir', () => {
    setProjectThemeEnabled(true)
    setProjectThemeEnabled(false)
    expect(isProjectThemeEnabled()).toBe(false)
    expect(store.get('scrakk-studio:project-theme-enabled')).toBe('0')
  })

  it('no notifica si el valor no cambia', () => {
    const listener = vi.fn()
    const off = subscribeToProjectTheme(listener)
    setProjectThemeEnabled(false)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})

describe('parseProjectTheme', () => {
  it('acepta { id, extensionId }', () => {
    expect(parseProjectTheme({ id: 'night', extensionId: 'builtin' })).toEqual({
      id: 'night', extensionId: 'builtin'
    })
  })

  it('rechaza datos inválidos', () => {
    expect(parseProjectTheme(null)).toBeNull()
    expect(parseProjectTheme('x')).toBeNull()
    expect(parseProjectTheme({ id: 'night' })).toBeNull()
    expect(parseProjectTheme({ id: 1, extensionId: 'ext' })).toBeNull()
  })
})
