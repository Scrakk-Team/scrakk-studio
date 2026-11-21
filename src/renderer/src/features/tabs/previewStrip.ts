// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Strip efímero para el ejemplo de Ajustes.
 *
 * El ejemplo NO es maquetado: renderiza el MISMO `TabStrip` que usan los
 * paneles, alimentado por el `tabsStore` real con specs creadas por la API
 * pública (`fileTab` / `panelTab`). Se monta al abrir Ajustes y se desmonta al
 * cerrar, así que no toca los strips del workspace ni se persiste.
 */

import { tabsStore, fileTab, panelTab } from './store'
import type { StripId } from './types'

export const PREVIEW_STRIP_ID: StripId = '__settings-preview__'

export function mountPreviewStrip(): void {
  tabsStore.removeStrip(PREVIEW_STRIP_ID)
  tabsStore.createStrip(PREVIEW_STRIP_ID)
  for (const spec of [
    fileTab('/ejemplo/app.tsx', 'app.tsx'),
    fileTab('/ejemplo/styles.css', 'styles.css'),
    panelTab('chat', 'Chat')
  ]) {
    tabsStore.spawnTab(PREVIEW_STRIP_ID, spec, { activate: false })
  }
  tabsStore.activateTab(PREVIEW_STRIP_ID, 'file:/ejemplo/app.tsx')
}

export function unmountPreviewStrip(): void {
  tabsStore.removeStrip(PREVIEW_STRIP_ID)
}
