// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Diagnóstico TEMPORAL de la ruta de apertura de archivos.
 *
 * El `catch` de `ensureSession` tragaba cualquier error en silencio y el
 * usuario veía el archivo abrir rápido pero nunca pintar, sin nada en
 * ningún log. Este helper escribe los pasos a /tmp/opencode/innerta_diag.log
 * para poder diagnosticarlo.
 *
 * BORRAR cuando el fallo esté resuelto.
 */
import { api } from '@services/api'

const PATH = '/tmp/opencode/innerta_diag.log'
const MAX_ENTRIES = 100
const lines: string[] = []
let writing = Promise.resolve()

function formatExtra(extra: unknown): string {
  if (extra instanceof Error) return `${extra.name}: ${extra.message}\n${extra.stack ?? ''}`
  if (typeof extra === 'object') {
    try {
      return JSON.stringify(extra)
    } catch {
      return String(extra)
    }
  }
  return String(extra)
}

export function diag(step: string, extra?: unknown): void {
  const stamp = new Date().toISOString()
  const suffix = extra !== undefined ? ` | ${formatExtra(extra)}` : ''
  lines.push(`[${stamp}] ${step}${suffix}`)
  if (lines.length > MAX_ENTRIES) lines.shift()
  const snapshot = lines.join('\n') + '\n'
  // En tests (y en previews sin bridge) `api.fs` no existe: el diagnóstico es
  // temporal y no puede romper la apertura de archivos por no tener logger.
  const writeFile = api?.fs?.writeFile
  if (typeof writeFile !== 'function') return
  writing = writing.then(() =>
    writeFile(PATH, snapshot).then(
      () => undefined,
      () => undefined
    )
  )
}
