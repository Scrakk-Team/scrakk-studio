// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Almacenamiento namespaced por proyecto.
 *
 * El id es el mismo de `<root>/.scrakk/history/id.json`
 * (services/workspaces/projectId), así que el estado de un proyecto sigue
 * reconociéndose aunque su carpeta se mueva. Cada scope vive en su propia
 * clave de localStorage:
 *
 *   scrakk:project.<projectId>.<scope>
 *
 * El motor (`lsGet`/`lsSet`) es el mismo StorageService global; este módulo
 * solo agrega el namespacing por proyecto.
 */

import { lsGet, lsSet } from './localStorage'

/** Scopes conocidos. Añadir uno nuevo = agregar la clave acá. */
export const PROJECT_STORAGE_SCOPES = {
  /** Rutas relativas de las carpetas expandidas en el explorer. */
  EXPLORER_EXPANDED: 'explorer.expanded'
} as const

export type ProjectStorageScope =
  (typeof PROJECT_STORAGE_SCOPES)[keyof typeof PROJECT_STORAGE_SCOPES]

/** Clave cruda (sin el prefijo `scrakk:` que agrega el motor). */
export function projectStorageKey(
  projectId: string,
  scope: ProjectStorageScope
): string {
  return `project.${projectId}.${scope}`
}

/** Tope defensivo: las carpetas expandidas no pueden crecer sin límite. */
const MAX_EXPANDED_PATHS = 500
const MAX_PATH_LENGTH = 4096

/** Rutas relativas (separadores `/`) de las carpetas expandidas. */
export type ExplorerExpandedPaths = string[]

function normalizeExpandedPaths(value: unknown): ExplorerExpandedPaths {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_PATH_LENGTH) continue
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
    if (out.length >= MAX_EXPANDED_PATHS) break
  }
  return out
}

/** Rutas relativas guardadas para el explorer de un proyecto. */
export function getPersistedProjectExplorerExpanded(
  projectId: string
): ExplorerExpandedPaths {
  if (typeof projectId !== 'string' || projectId.length === 0) return []
  return normalizeExpandedPaths(
    lsGet<unknown>(projectStorageKey(projectId, PROJECT_STORAGE_SCOPES.EXPLORER_EXPANDED))
  )
}

/** Guarda las rutas relativas del explorer de un proyecto (dedupe + tope). */
export function persistProjectExplorerExpanded(
  projectId: string,
  paths: Iterable<string>
): void {
  if (typeof projectId !== 'string' || projectId.length === 0) return
  const normalized = normalizeExpandedPaths(Array.from(paths))
  lsSet(
    projectStorageKey(projectId, PROJECT_STORAGE_SCOPES.EXPLORER_EXPANDED),
    normalized
  )
}
