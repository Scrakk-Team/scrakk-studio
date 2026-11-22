// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Orden persistido de los 3 botones de la bienvenida. */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) }
})

const { loadActionOrder, reorderActions } = await import('../src/renderer/src/features/layout/panels/WelcomePanel/actionOrder')

beforeEach(() => store.clear())

describe('welcome action order', () => {
  it('por defecto es new, open, folder', () => {
    expect(loadActionOrder()).toEqual(['new', 'open', 'folder'])
  })

  it('respeta un orden guardado', () => {
    store.set('scrakk:welcome-action-order', JSON.stringify(['folder', 'new', 'open']))
    expect(loadActionOrder()).toEqual(['folder', 'new', 'open'])
  })

  it('rellena ids faltantes y descarta basura', () => {
    store.set('scrakk:welcome-action-order', JSON.stringify(['folder', 'bogus']))
    expect(loadActionOrder()).toEqual(['folder', 'new', 'open'])
  })

  it('reordena y persiste', () => {
    const next = reorderActions(['new', 'open', 'folder'], 'folder', 'new')
    expect(next).toEqual(['folder', 'new', 'open'])
    expect(loadActionOrder()).toEqual(['folder', 'new', 'open'])
  })
})
