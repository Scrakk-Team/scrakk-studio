// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Orden de los items de la status bar (patrón del repo: Map + Set + emit).
 *
 * Dos grupos INDEPENDIENTES: los de la izquierda se reordenan entre sí y los
 * de la derecha (layout, campana, ajustes) se quedan anclados ahí, como en un
 * IDE. Se persiste en localStorage y se publica a la barra.
 */

const STORAGE_KEY = 'scrakk:statusbar-order'

/** Izquierda: información del workspace. Derecha: acciones/chrome (FIJO ahí). */
export const DEFAULT_LEFT = [
  'lsp', 'git', 'problems', 'sep-left', 'cursor', 'encoding', 'ext-left'
] as const
/** El separador vive FUERA de los grupos (entre izq y der), no es arrastrable. */
export const DEFAULT_RIGHT = ['layout', 'bell', 'settings'] as const

type Listener = () => void
const listeners = new Set<Listener>()
let left: string[] = loadSide('left')
let right: string[] = loadSide('right')

function validFor(side: 'left' | 'right'): readonly string[] {
  return side === 'left' ? DEFAULT_LEFT : DEFAULT_RIGHT
}

function loadSide(side: 'left' | 'right'): string[] {
  const defaults = validFor(side)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...defaults]
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const list = Array.isArray(parsed?.[side])
      ? (parsed[side] as unknown[])
      : (Array.isArray(parsed) ? parsed as unknown[] : [])
    const valid = list.filter((id): id is string => typeof id === 'string' && (defaults as readonly string[]).includes(id))
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left, right }))
  } catch {
    // Sin storage: solo memoria.
  }
}

export function getStatusLeft(): string[] { return [...left] }
export function getStatusRight(): string[] { return [...right] }

/** Mueve `dragged` dentro de su lado, antes/después de `target`. */
export function moveStatusBarItem(dragged: string, target: string, before: boolean): void {
  const fromLeft = left.includes(dragged)
  const fromRight = right.includes(dragged)
  const list = fromLeft ? left : fromRight ? right : null
  // Los items de la derecha NO se pueden arrastrar al grupo izquierdo.
  if (!list) return
  if (!list.includes(target)) return
  moveIn(list, dragged, target, before)
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
  left = [...DEFAULT_LEFT]
  right = [...DEFAULT_RIGHT]
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
  emit()
}

export function subscribeToStatusBarOrder(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Solo tests. */
export function _resetOrderForTests(): void {
  left = [...DEFAULT_LEFT]
  right = [...DEFAULT_RIGHT]
  listeners.clear()
}
