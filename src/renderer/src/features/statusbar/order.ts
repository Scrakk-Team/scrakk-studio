// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Orden de los items de la status bar (patrón del repo: Map + Set + emit).
 *
 * Layout por defecto (el espacio del centro es un flex spacer, no un item):
 *
 *   [lsp, git, problems, cursor, encoding, extensiones]     [layout] | campana, ajustes
 *   \__________________ grupo izquierdo ________________/   \ der /
 *
 * Tres zonas INDEPENDIENTES: izquierda, `layout` (justo antes del separador) y
 * derecha (campana + ajustes). Cada zona se reordena entre sí, sin mezclarse.
 * El separador `|` es fijo entre `layout` y las acciones de la derecha.
 * Se persiste en localStorage y se publica a la barra.
 */

const STORAGE_KEY = 'scrakk:statusbar-order'
const DRAG_MODE_KEY = 'scrakk:statusbar-drag-mode'

/** Izquierda: información del workspace + extensiones. */
export const DEFAULT_LEFT = [
  'lsp', 'git', 'problems', 'cursor', 'encoding', 'ext-left'
] as const
/** Toggles de panel, pegados al separador (después del espacio del centro). */
export const DEFAULT_LAYOUT = ['layout'] as const
/** Derecha: notificaciones y ajustes, en ese orden (el `|` está fuera). */
export const DEFAULT_RIGHT = ['bell', 'settings'] as const

type Side = 'left' | 'layout' | 'right'
type Listener = () => void

function defaultsFor(side: Side): readonly string[] {
  if (side === 'left') return DEFAULT_LEFT
  if (side === 'layout') return DEFAULT_LAYOUT
  return DEFAULT_RIGHT
}

const listeners = new Set<Listener>()
const left = loadSide('left')
const layout = loadSide('layout')
const right = loadSide('right')
const sides: Record<Side, string[]> = { left, layout, right }

function loadSide(side: Side): string[] {
  const defaults = defaultsFor(side)
  // La derecha SIEMPRE es notificaciones → ajustes: es una posición fija, no
  // un orden del usuario. Un guardado viejo podía traer `settings` primero.
  if (side === 'right') return [...defaults]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...defaults]
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const list = Array.isArray(parsed?.[side])
      ? (parsed[side] as unknown[])
      : (Array.isArray(parsed) ? parsed as unknown[] : [])
    const valid = list.filter(
      (id): id is string => typeof id === 'string' && (defaults as readonly string[]).includes(id)
    )
    for (const id of defaults) if (!valid.includes(id)) valid.push(id)
    return valid
  } catch {
    return [...defaults]
  }
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, layout, right }))
  } catch {
    // Sin storage: solo memoria.
  }
}

export function getStatusLeft(): string[] { return [...left] }
export function getStatusLayout(): string[] { return [...layout] }
export function getStatusRight(): string[] { return [...right] }

/** Mueve `dragged` dentro de SU zona, antes/después de `target`. */
export function moveStatusBarItem(dragged: string, target: string, before: boolean): void {
  const list = (Object.keys(sides) as Side[]).find((side) => sides[side].includes(dragged))
  // Los items NO se pueden arrastrar a otra zona (separador / centro fijos) y
  // las acciones de la derecha NO se reordenan: notificaciones → ajustes.
  if (!list || list === 'right' || !sides[list].includes(target)) return
  moveIn(sides[list], dragged, target, before)
}

function moveIn(list: string[], dragged: string, target: string, before: boolean): void {
  if (dragged === target) return
  const from = list.indexOf(dragged)
  if (from < 0) return
  const next = [...list]
  next.splice(from, 1)
  let to = next.indexOf(target)
  if (to < 0) return
  if (!before) to += 1
  next.splice(to, 0, dragged)
  if (next.every((id, i) => id === list[i])) return
  list.splice(0, list.length, ...next)
  persist()
  emit()
}

export function resetStatusBarOrder(): void {
  left.splice(0, left.length, ...DEFAULT_LEFT)
  layout.splice(0, layout.length, ...DEFAULT_LAYOUT)
  right.splice(0, right.length, ...DEFAULT_RIGHT)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
  emit()
}

export function subscribeToStatusBarOrder(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Modo drageable: el drag está DESACTIVADO por defecto para que los clicks de
 * los chips funcionen normal. Se activa con click derecho sobre la statusbar →
 * "Modo drageable" (menú contextual global).
 */
const dragModeListeners = new Set<() => void>()
let dragMode = loadDragMode()

function loadDragMode(): boolean {
  try {
    return localStorage.getItem(DRAG_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function isDragModeEnabled(): boolean {
  return dragMode
}

export function setDragMode(enabled: boolean): void {
  if (dragMode === enabled) return
  dragMode = enabled
  try {
    localStorage.setItem(DRAG_MODE_KEY, String(enabled))
  } catch { /* sin storage: solo memoria */ }
  for (const listener of [...dragModeListeners]) {
    try { listener() } catch { /* suscriptor roto */ }
  }
}

export function toggleDragMode(): void {
  setDragMode(!dragMode)
}

export function subscribeToDragMode(listener: () => void): () => void {
  dragModeListeners.add(listener)
  return () => { dragModeListeners.delete(listener) }
}

/** Solo tests. */
export function _resetOrderForTests(): void {
  resetStatusBarOrder()
  listeners.clear()
  dragMode = false
  dragModeListeners.clear()
}
