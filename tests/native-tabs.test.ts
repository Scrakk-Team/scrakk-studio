// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencia de tabs nativas (WASM) dentro del contenedor del TabStrip. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})

const { isNativeTabsEnabled, setNativeTabsEnabled, subscribeToNativeTabs } = await import(
  '../src/renderer/src/services/nativeTabs'
)

beforeEach(() => {
  store.clear()
  setNativeTabsEnabled(false)
})

describe('native tabs preference', () => {
  it('persiste y notifica', () => {
    const listener = vi.fn()
    const off = subscribeToNativeTabs(listener)
    setNativeTabsEnabled(true)
    expect(isNativeTabsEnabled()).toBe(true)
    expect(store.get('scrakk-studio:native-tabs')).toBe('1')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
  })

  it('no notifica si no cambia', () => {
    const listener = vi.fn()
    const off = subscribeToNativeTabs(listener)
    setNativeTabsEnabled(false)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})
