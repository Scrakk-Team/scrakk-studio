// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Navegación rápida de tabs — DATA pura (sin React, sin atajos sueltos).
 *
 * Los comandos se registran en `commandRegistry` desde el bridge de layout;
 * el registry es el que crea los shortcuts y el que permite re-mapearlos desde
 * Ajustes → Atajos. Agregar otro atajo = una línea acá + su entrada en presets.
 */

import { t } from '@core/i18n'
import type { StripState } from './types'

export interface TabNavigationDef {
  id: string
  title: string
  keybinding: string
  direction: 1 | -1
}

export const TAB_NAVIGATION: TabNavigationDef[] = [
  {
    id: 'tabs.next',
    get title() { return t('features.tab.siguiente') },
    keybinding: 'mod+tab',
    direction: 1
  },
  {
    id: 'tabs.previous',
    get title() { return t('features.tab.anterior') },
    keybinding: 'mod+shift+tab',
    direction: -1
  }
]

/** Id de la tab vecina en un strip (wrap-around). null si no hay cambio. */
export function nextTabId(strip: StripState | null, direction: 1 | -1): string | null {
  if (!strip || strip.tabs.length < 2) return null
  const current = strip.tabs.findIndex((tab) => tab.id === strip.activeId)
  if (current < 0) return strip.tabs[direction === 1 ? 0 : strip.tabs.length - 1].id
  const next = (current + direction + strip.tabs.length) % strip.tabs.length
  return strip.tabs[next]?.id ?? null
}
