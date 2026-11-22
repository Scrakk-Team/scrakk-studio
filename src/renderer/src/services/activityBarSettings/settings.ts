// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Store de preferencias experimentales de la Activity Bar (izq + der).
 * Patrón del repo: clave propia + getter/setter/subscribe con normalización.
 */

import type { ActivityBarMode, DisabledActivitySide } from './types'

const MODE_KEY = 'scrakk-studio:activitybar-mode'
const DISABLED_KEY = 'scrakk-studio:activitybar-disabled-side'

type Listener = () => void
const listeners = new Set<Listener>()

export function normalizeActivityBarMode(raw: unknown): ActivityBarMode {
  return raw === 'centered' || raw === 'wheel' ? raw : 'default'
}

export function normalizeDisabledSide(raw: unknown): DisabledActivitySide {
  return raw === 'left' || raw === 'right' ? raw : 'none'
}

function read<T>(key: string, normalize: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : normalize(raw)
  } catch {
    return fallback
  }
}

let mode = read(MODE_KEY, normalizeActivityBarMode, 'default')
let disabledSide = read(DISABLED_KEY, normalizeDisabledSide, 'none')

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function getActivityBarMode(): ActivityBarMode {
  return mode
}

export function setActivityBarMode(next: ActivityBarMode): void {
  const value = normalizeActivityBarMode(next)
  if (mode === value) return
  mode = value
  try {
    localStorage.setItem(MODE_KEY, value)
  } catch { /* sin storage: solo memoria */ }
  emit()
}

export function getDisabledActivitySide(): DisabledActivitySide {
  return disabledSide
}

/** Sólo una barra puede estar desactivada: el valor es un enum, no una lista. */
export function setDisabledActivitySide(next: DisabledActivitySide): void {
  const value = normalizeDisabledSide(next)
  if (disabledSide === value) return
  disabledSide = value
  try {
    localStorage.setItem(DISABLED_KEY, value)
  } catch { /* sin storage: solo memoria */ }
  emit()
}

export function subscribeToActivityBarSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests. */
export function _resetActivityBarSettingsForTests(): void {
  mode = 'default'
  disabledSide = 'none'
  listeners.clear()
}
