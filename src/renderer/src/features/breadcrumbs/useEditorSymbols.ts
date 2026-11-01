// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Símbolos y línea del cursor para el breadcrumb.
 *
 * Fuente única: el árbol dinámico que publica `dynamicSyntax` desde
 * `tags.scm`. No usa el extractor por regex: sus símbolos no tienen rangos
 * fiables para responder "¿qué símbolo contiene esta línea?".
 *
 * El cursor solo se acepta si pertenece a ESTE archivo. El bridge del engine
 * empuja el path junto con Ln/Col, así que un breadcrumb de una tab o split
 * inactivo no se pinta con el cursor de otro editor.
 */

import { useEffect, useState } from 'react'
import type { DocumentSymbol } from '@services/symbolExtractor'
import {
  getDynamicSyntax,
  subscribeToDynamicSyntax
} from '@services/extensions/dynamicSyntax'
import { getEditorFiles } from '@features/editor/editorBus'
import {
  getEditorCursor,
  subscribeToEditorCursor,
  type EditorCursor
} from '@features/editor/cursorBus'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function samePath(a: string, b: string): boolean {
  if (a === b) return true
  const left = normalizePath(a)
  const right = normalizePath(b)
  if (left === right) return true
  // Windows: la misma ruta puede diferir solo en mayúsculas.
  return (
    /^[A-Za-z]:\//.test(left) &&
    /^[A-Za-z]:\//.test(right) &&
    left.toLowerCase() === right.toLowerCase()
  )
}

function belongsTo(cursor: EditorCursor | null, path: string): boolean {
  if (!cursor) return false
  // Los engines nuevos mandan su path. El fallback cubre un evento viejo o
  // un bridge que todavía no lo empujó: solo vale si es la tab activa global.
  if (cursor.path !== undefined) return samePath(cursor.path, path)
  const active = getEditorFiles().activePath
  return active !== null && samePath(active, path)
}

export interface EditorSymbolsState {
  symbols: DocumentSymbol[]
  /** Línea 0-based del cursor en este archivo, o null si no es el enfocado. */
  line: number | null
}

export function useEditorSymbols(path: string | null): EditorSymbolsState {
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([])
  const [line, setLine] = useState<number | null>(null)

  useEffect(() => {
    if (!path) {
      setSymbols([])
      return
    }
    const apply = (): void => {
      setSymbols(getDynamicSyntax(path)?.symbols ?? [])
    }
    apply()
    // El árbol llega después de abrir el archivo: sin la suscripción el
    // breadcrumb se quedaría con la lista vacía.
    return subscribeToDynamicSyntax(apply)
  }, [path])

  useEffect(() => {
    if (!path) {
      setLine(null)
      return
    }
    const apply = (cursor: EditorCursor | null): void => {
      const next = cursor && belongsTo(cursor, path) ? cursor.line : null
      // La columna cambia en cada flecha; la cadena de símbolos solo depende
      // de la línea, así que no re-renderizamos si sigue en la misma.
      setLine((previous) => (previous === next ? previous : next))
    }
    apply(getEditorCursor())
    return subscribeToEditorCursor(apply)
  }, [path])

  return { symbols, line }
}
