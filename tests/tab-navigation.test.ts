// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Navegación rápida de tabs: comandos data + vecino con wrap-around. */

import { describe, expect, it } from 'vitest'
import { TAB_NAVIGATION, nextTabId } from '../src/renderer/src/features/tabs/tabNavigation'
import type { StripState } from '../src/renderer/src/features/tabs/types'

const strip = (ids: string[], activeId: string | null): StripState => ({
  stripId: 'center',
  tabs: ids.map((id) => ({ id, kind: 'file', filePath: `/r/${id}` })),
  activeId
})

describe('TAB_NAVIGATION', () => {
  it('declara los dos comandos con atajo reasignable', () => {
    expect(TAB_NAVIGATION.map((c) => c.id)).toEqual(['tabs.next', 'tabs.previous'])
    expect(TAB_NAVIGATION.map((c) => c.keybinding)).toEqual(['mod+tab', 'mod+shift+tab'])
  })

  it('avanza y retrocede con wrap-around', () => {
    const s = strip(['a', 'b', 'c'], 'a')
    expect(nextTabId(s, 1)).toBe('b')
    expect(nextTabId(strip(['a', 'b', 'c'], 'c'), 1)).toBe('a')
    expect(nextTabId(strip(['a', 'b', 'c'], 'a'), -1)).toBe('c')
  })

  it('no cambia con menos de dos tabs o sin strip', () => {
    expect(nextTabId(strip(['a'], 'a'), 1)).toBeNull()
    expect(nextTabId(null, -1)).toBeNull()
  })
})
