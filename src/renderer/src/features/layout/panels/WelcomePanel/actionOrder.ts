// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Orden persistido de los 3 botones de acción de la bienvenida (lógica pura). */

export type WelcomeActionId = "new" | "open" | "folder"
export const WELCOME_ACTION_IDS: WelcomeActionId[] = ["new", "open", "folder"]
export const WELCOME_ORDER_KEY = "scrakk:welcome-action-order"

/** Orden guardado, con validación y relleno de los ids que falten. */
export function loadActionOrder(): WelcomeActionId[] {
  try {
    const raw = localStorage.getItem(WELCOME_ORDER_KEY)
    if (!raw) return [...WELCOME_ACTION_IDS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...WELCOME_ACTION_IDS]
    const valid = parsed.filter((id): id is WelcomeActionId =>
      WELCOME_ACTION_IDS.includes(id as WelcomeActionId)
    )
    for (const id of WELCOME_ACTION_IDS) if (!valid.includes(id)) valid.push(id)
    return valid.slice(0, WELCOME_ACTION_IDS.length)
  } catch {
    return [...WELCOME_ACTION_IDS]
  }
}

/** Reordena `from` a la posición de `to` (mutación in-place sobre una copia). */
export function reorderActions(
  order: WelcomeActionId[],
  from: WelcomeActionId,
  to: WelcomeActionId
): WelcomeActionId[] {
  if (from === to) return order
  const next = [...order]
  const fromIndex = next.indexOf(from)
  const toIndex = next.indexOf(to)
  if (fromIndex < 0 || toIndex < 0) return order
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, from)
  try {
    localStorage.setItem(WELCOME_ORDER_KEY, JSON.stringify(next))
  } catch {
    // Sin storage: el orden vive solo en esta sesión.
  }
  return next
}
