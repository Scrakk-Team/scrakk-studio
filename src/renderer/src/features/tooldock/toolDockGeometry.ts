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
export function computePanelMaxHeight(anchorBottom: number | null, viewportH: number): number {
  if (anchorBottom === null) return 600
  return Math.max(120, viewportH - anchorBottom - 24)
}
