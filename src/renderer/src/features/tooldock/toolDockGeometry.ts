// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Geometría pura del panel flotante del ToolDock (sin React/DOM).
 */

/**
 * Altura máxima del panel flotante.
 *
 * `anchorBottom` es la distancia desde el FONDO del viewport hasta la base del
 * panel. El espacio para crecer hacia ARRIBA es `viewportH - anchorBottom`,
 * no `anchorBottom`: con el dock pegado al fondo, la vieja fórmula daba ~40px
 * y el panel quedaba clavado en el mínimo (cursor de resize, pero no resizaba).
 */
/** Fracción máxima del viewport que puede ocupar el panel. */
export const TOOLDOCK_MAX_RATIO = 0.6

export function computePanelMaxHeight(anchorBottom: number | null, viewportH: number): number {
  const cap = Math.round(viewportH * TOOLDOCK_MAX_RATIO)
  if (anchorBottom === null) return Math.min(600, cap)
  return Math.max(120, Math.min(cap, viewportH - anchorBottom - 24))
}
