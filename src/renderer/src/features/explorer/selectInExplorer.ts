// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Petición global para seleccionar/revelar un path en el explorer nativo.
 *
 * La bienvenida y el menú Archivo crean archivos fuera del panel, así que
 * cuando el explorer esté montado (o se abra después) debe seleccionar esa
 * fila. El path pendiente se conserva hasta que algún ExplorerPanel lo toma.
 */

const EVENT = 'scrakk:explorer-select-path'
type Listener = (path: string) => void

const listeners = new Set<Listener>()
let pending: string | null = null

export function revealInExplorer(path: string): void {
  pending = path
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { path } }))
  }
}

/**
 * Toma el path pendiente (si hay) y lo limpia. Lo llama el explorer cuando ya
 * tiene un root, para no perder la petición si llegó antes de montarse.
 */
export function consumePendingExplorerSelection(): string | null {
  const path = pending
  pending = null
  return path
}

export function subscribeToExplorerSelection(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Se llama una vez desde el módulo para escuchar los eventos globales. */
export function installExplorerSelectionBridge(): void {
  if (typeof window === 'undefined') return
  window.addEventListener(EVENT, (event: Event) => {
    const path = (event as CustomEvent<{ path?: string }>).detail?.path
    if (!path) return
    for (const listener of [...listeners]) {
      try {
        listener(path)
      } catch {
        // Suscriptor roto no tumba a los demás.
      }
    }
  })
}

/** Solo tests. */
export function _resetExplorerSelectionForTests(): void {
  pending = null
  listeners.clear()
}
