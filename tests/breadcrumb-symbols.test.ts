// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cadena de símbolos del breadcrumb según la línea del cursor.
 *
 * Los símbolos son los de `dynamicSyntax` (árbol real): líneas 0-based y
 * `endLine` inclusivo.
 */

import { describe, expect, it } from 'vitest'
import type { DocumentSymbol } from '../src/renderer/src/services/symbolExtractor'
import { buildSymbolCrumbs } from '../src/renderer/src/features/breadcrumbs/symbols'

const symbols: DocumentSymbol[] = [
  {
    name: 'Clase',
    kind: 'class',
    line: 2,
    endLine: 20,
    children: [
      {
        name: 'metodo',
        kind: 'method',
        line: 5,
        endLine: 9,
        children: [{ name: 'param', kind: 'variable', line: 6, endLine: 6 }]
      },
      { name: 'otro', kind: 'method', line: 12, endLine: 16 }
    ]
  },
  { name: 'suelta', kind: 'function', line: 25, endLine: 30 }
]

function names(line: number | null): string[] {
  return buildSymbolCrumbs(symbols, line).map((crumb) => crumb.symbol.name)
}

describe('buildSymbolCrumbs', () => {
  it('devuelve la cadena anidada que contiene la línea', () => {
    expect(names(2)).toEqual(['Clase'])
    expect(names(5)).toEqual(['Clase', 'metodo'])
    expect(names(6)).toEqual(['Clase', 'metodo', 'param'])
    expect(names(13)).toEqual(['Clase', 'otro'])
  })

  it('usa los límites inclusivos de endLine', () => {
    expect(names(9)).toEqual(['Clase', 'metodo'])
    expect(names(10)).toEqual(['Clase'])
    expect(names(20)).toEqual(['Clase'])
    expect(names(21)).toEqual([])
    expect(names(30)).toEqual(['suelta'])
  })

  it('vacío fuera de todos los símbolos', () => {
    expect(names(0)).toEqual([])
    expect(names(1)).toEqual([])
    expect(names(31)).toEqual([])
    expect(names(null)).toEqual([])
  })

  it('expone el nivel de hermanos para el dropdown', () => {
    const crumbs = buildSymbolCrumbs(symbols, 6)
    expect(crumbs).toHaveLength(3)
    expect(crumbs[0].level).toEqual(symbols)
    expect(crumbs[1].level).toEqual(symbols[0].children)
    expect(crumbs[2].level).toEqual(symbols[0].children?.[0].children)
    expect(crumbs[1].symbol).toBe(symbols[0].children?.[0])
  })
})
