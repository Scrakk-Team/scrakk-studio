// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Ancho fijo OPCIONAL para las tabs (todos los strips: centro, laterales,
 * inferior). Desactivado por defecto: cada tab mide su contenido como siempre.
 *
 * Store PURO (sin importar React ni servicios), igual que `dock.ts`: lo consume
 * el `TabStrip` y el panel de Ajustes. Persiste en localStorage y notifica a
 * los suscriptores para que las barras se repinten al cambiar el valor.
 */

const ENABLED_KEY = 'scrakk:tabs-fixed-width'
const WIDTH_KEY = 'scrakk:tabs-fixed-width-px'

/** Rango del ancho configurable (px). */
export const TAB_WIDTH_MIN = 80
export const TAB_WIDTH_MAX = 320
export const TAB_WIDTH_DEFAULT = 140

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function readWidth(): number {
  try {
    const raw = Number.parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10)
    if (Number.isFinite(raw)) return clamp(raw)
  } catch {
    // Sin storage: valor por defecto.
  }
  return TAB_WIDTH_DEFAULT
}

export function clamp(width: number): number {
  return Math.min(TAB_WIDTH_MAX, Math.max(TAB_WIDTH_MIN, Math.round(width)))
}

let enabled = readEnabled()
let width = readWidth()

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

/** ¿Las tabs usan ancho fijo? */
export function isTabWidthFixed(): boolean {
  return enabled
}

/** Ancho fijo configurado (px), esté o no activo. */
export function getTabWidth(): number {
  return width
}

/** Activa/desactiva el modo. Persiste y notifica (idempotente). */
export function setTabWidthFixed(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
  } catch {
    // Sin storage: solo memoria esta sesión.
  }
  emit()
}

/** Fija el ancho (acotado al rango). Persiste y notifica. */
export function setTabWidth(next: number): void {
  const clamped = clamp(next)
  if (width === clamped) return
  width = clamped
  try {
    localStorage.setItem(WIDTH_KEY, String(clamped))
  } catch {
    // Sin storage: solo memoria esta sesión.
  }
  emit()
}

export function toggleTabWidthFixed(): void {
  setTabWidthFixed(!enabled)
}

export function subscribeToTabWidth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests: resetea el store sin tocar localStorage real. */
export function _resetTabWidthForTests(): void {
  enabled = false
  width = TAB_WIDTH_DEFAULT
  listeners.clear()
}
