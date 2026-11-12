// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cálculo de deltas de texto y del merge incremental de capturas.
 *
 * Está separado del tokenizer para que las piezas sean puras y testeables sin
 * spawnear parsers. La lógica que tree-sitter aplica (tree.edit) exige que
 * los dos extremos del rango editado se describan en POSICIONES del texto
 * viejo/viejo-y/texto nuevo, así que aquí viven las utilidades que las
 * calculan sin O(n²).
 *
 * El índice que manejan las capturas es el de columnas UTF-16 (misma unidad
 * que el texto que recibe el worker: `string.length`), lo que mantiene el
 * resto del pipeline consistente (ver `scopes.ts`).
 */

import type { RawCapture } from './scopes'
import type { RawMatch } from './queryData'

/** Edición mínima que cubre TODO lo que cambió entre `oldText` y `newText`. */
export interface MinimalEdit {
  /** Índice UTF-16 donde empieza el tramo distinto. */
  startIndex: number
  /** Índice UTF-16 donde termina el tramo distinto en el texto viejo. */
  oldEndIndex: number
  /** Índice UTF-16 donde termina el tramo distinto en el texto nuevo. */
  newEndIndex: number
}

/**
 * Diferencia simétrica en un solo tramo.
 *
 * El algoritmo de prefijo/sufijo común siempre cubre el cambio real con un
 * único rango — inserción, borrado, sustitución, pegar — porque los tramos
 * no cambiados de los bordes se quedan donde están. Si los textos son
 * idénticos devuelve `null`.
 *
 * Complejidad: O(|prefijo| + |sufijo|) — no recorre el texto entero ni una
 * sola vez como mucho en el caso patológico (editar en la línea 0 del
 * archivo más grande conocido: ~33 MB de prefijo/sufijo común, aceptable
 * para un diff de una compare por carácter, sin queries ni parser de por
 * medio).
 */
export function minimalEdit(oldText: string, newText: string): MinimalEdit | null {
  if (oldText === newText) return null
  let startIndex = 0
  const oldLen = oldText.length
  const newLen = newText.length
  const minLen = Math.min(oldLen, newLen)
  while (startIndex < minLen && oldText.charCodeAt(startIndex) === newText.charCodeAt(startIndex)) {
    startIndex++
  }
  let oldEndIndex = oldLen
  let newEndIndex = newLen
  while (
    oldEndIndex > startIndex &&
    newEndIndex > startIndex &&
    oldText.charCodeAt(oldEndIndex - 1) === newText.charCodeAt(newEndIndex - 1)
  ) {
    oldEndIndex--
    newEndIndex--
  }
  return { startIndex, oldEndIndex, newEndIndex }
}

/** Índice UTF-16 → punto (fila, columna) para tree.edit(). */
export function pointAt(starts: number[], index: number): { row: number; column: number } {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= index) low = mid
    else high = mid - 1
  }
  return { row: low, column: index - starts[low] }
}

/**
 * Capturas en el TEXTO NUEVO, reaprovechando las del viejo.
 *
 * Reglas (los índices de tree.edit):
 *  - Captura completamente antes del tramo editado → se conserva tal cual.
 *  - Captura completamente después del tramo editado → se desplaza `delta`.
 *  - Captura que se SOLAPA con el tramo editado → se tira (se re-colecta fresca).
 */
export function mergeCaptures(
  cached: readonly RawCapture[],
  edit: MinimalEdit
): { kept: RawCapture[]; delta: number } {
  const delta = edit.newEndIndex - edit.oldEndIndex
  const kept: RawCapture[] = []
  for (const capture of cached) {
    if (capture.end < edit.startIndex) {
      kept.push(capture)
    } else if (capture.start >= edit.oldEndIndex) {
      kept.push({ ...capture, start: capture.start + delta, end: capture.end + delta })
    }
    // solapada o en el BORDE: fuera (una captura que termina exactamente en el
    // punto de edición puede expandirse con la inserción: se re-colecta)
  }
  return { kept, delta }
}

/** Aplicar la misma regla sobre los matches (que envuelven capturas). */
export function mergeMatches(
  cached: readonly RawMatch[],
  edit: MinimalEdit
): { kept: RawMatch[]; delta: number } {
  const delta = edit.newEndIndex - edit.oldEndIndex
  const kept: RawMatch[] = []
  for (const match of cached) {
    const captures: RawCapture[] = []
    let overlaps = false
    for (const capture of match.captures) {
      if (capture.end < edit.startIndex) {
        captures.push(capture)
      } else if (capture.start >= edit.oldEndIndex) {
        captures.push({ ...capture, start: capture.start + delta, end: capture.end + delta })
      } else {
        overlaps = true
      }
    }
    if (!overlaps) kept.push({ ...match, captures })
    // match solapado: fuera (se re-colecta en la corrida fresca)
  }
  return { kept, delta }
}

/** Ordena las capturas al formato que espera el pipeline (ver `buildScopeTokens`). */
export function sortCaptures(captures: RawCapture[]): RawCapture[] {
  return [...captures].sort(
    (a, b) =>
      a.start - b.start || b.end - a.end || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )
}
