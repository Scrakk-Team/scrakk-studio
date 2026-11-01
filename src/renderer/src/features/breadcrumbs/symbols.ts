// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cadena de símbolos del breadcrumb — puro, sin React ni engine.
 *
 * Los símbolos vienen del árbol real (`tags.scm`, vía dynamicSyntax), con
 * líneas 0-based y `endLine` inclusivo. Por eso alcanza con bajar por los
 * hijos que CONTIENEN la línea del cursor para saber en qué clase/función
 * está parado el usuario.
 */

import type { DocumentSymbol } from '@services/symbolExtractor'

export interface SymbolCrumb {
  /** Símbolo seleccionado en este nivel. */
  symbol: DocumentSymbol
  /**
   * Hermanos de este nivel (incluye a `symbol`). Es lo que se muestra en el
   * dropdown: el nivel completo, con el símbolo actual resaltado.
   */
  level: DocumentSymbol[]
}

function containsLine(symbol: DocumentSymbol, line: number): boolean {
  const end = symbol.endLine ?? symbol.line
  return symbol.line <= line && end >= line
}

/**
 * Cadena `clase > método > …` que contiene la línea. Vacía si el cursor está
 * fuera de todos los símbolos.
 */
export function buildSymbolCrumbs(
  symbols: readonly DocumentSymbol[],
  line: number | null
): SymbolCrumb[] {
  if (line === null || line < 0) return []
  const out: SymbolCrumb[] = []
  let level: readonly DocumentSymbol[] = symbols
  while (level.length > 0) {
    const symbol = level.find((candidate) => containsLine(candidate, line))
    if (!symbol) break
    out.push({ symbol, level: [...level] })
    level = symbol.children ?? []
  }
  return out
}
