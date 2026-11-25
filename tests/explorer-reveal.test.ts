// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Selección global de un path en el explorer nativo. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, Array<(event: unknown) => void>>()
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: (event: unknown) => void): void => {
    const list = handlers.get(type) ?? []
    list.push(fn)
    handlers.set(type, list)
  },
  dispatchEvent: (event: { type: string; detail?: unknown }): void => {
    for (const fn of handlers.get(event.type) ?? []) fn(event)
  }
})

const {
  revealInExplorer,
  consumePendingExplorerSelection,
  subscribeToExplorerSelection,
  installExplorerSelectionBridge,
  _resetExplorerSelectionForTests
} = await import('../src/renderer/src/features/explorer/selectInExplorer')

beforeEach(() => {
  handlers.clear()
  _resetExplorerSelectionForTests()
  installExplorerSelectionBridge()
})

describe('revealInExplorer', () => {
  it('guarda el path pendiente y avisa a los suscriptores', () => {
    const seen: string[] = []
    const off = subscribeToExplorerSelection((path) => seen.push(path))
    revealInExplorer('/r/nuevo.txt')
    expect(seen).toEqual(['/r/nuevo.txt'])
    expect(consumePendingExplorerSelection()).toBe('/r/nuevo.txt')
    expect(consumePendingExplorerSelection()).toBeNull()
    off()
  })

  it('conserva el path hasta que el explorer lo consume', () => {
    revealInExplorer('/r/a.txt')
    expect(consumePendingExplorerSelection()).toBe('/r/a.txt')
  })
})
