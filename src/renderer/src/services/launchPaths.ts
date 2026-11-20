// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Rutas abiertas desde el explorador del sistema (Windows / Linux).
 *
 * El bridge de preload se suscribe al canal push del main y este módulo guarda
 * las rutas en cola hasta que la app las consume al montar. Tambien reclama la
 * cola del main (`takeOpenPaths`) para no perder el evento de arranque en frio.
 * `seen` evita procesar dos veces una misma ruta si llega por push y por pull.
 */

import { api } from '@services/api'
import type { OpenPathEntry, OpenPathsPayload } from '@shared/app'

type Listener = (paths: OpenPathEntry[]) => void

const seen = new Set<string>()
const listeners = new Set<Listener>()
let started = false

function deliver(payload: OpenPathsPayload | null | undefined): void {
  const paths = payload?.paths
  if (!Array.isArray(paths) || paths.length === 0) return
  const fresh = paths.filter((entry) => entry?.path && !seen.has(entry.path))
  if (fresh.length === 0) return
  for (const entry of fresh) seen.add(entry.path)
  for (const listener of [...listeners]) {
    try {
      listener(fresh)
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

/** Idempotente: se llama una vez desde el efecto de montaje de App. */
export function initLaunchPaths(): void {
  if (started) return
  const bridge = api?.app
  if (!bridge || typeof bridge.onOpenPaths !== 'function' || typeof bridge.takeOpenPaths !== 'function') {
    return
  }
  started = true
  bridge.onOpenPaths(deliver)
  void bridge.takeOpenPaths().then(deliver).catch(() => undefined)
}

export function subscribeLaunchPaths(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: limpia la deduplicación y el estado de arranque. */
export function _resetLaunchPathsForTests(): void {
  seen.clear()
  listeners.clear()
  started = false
}
