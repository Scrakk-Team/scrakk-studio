// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

import { t } from '@core/i18n'
/**
 * Botón de "Tabs" — SIEMPRE visible en la activitybar.
 *
 * Antes tenía `when: 'tabsDocked'`, lo cual era un ciclo: el botón solo
 * aparecía DESPUÉS de acoplar, así que no había forma de activar el modo desde
 * la barra. Ahora el botón está siempre y su click (en ActivityBar) togglea el
 * panel y sincroniza el modo acoplado. Su ícono (`tabs`, ventanas múltiples de
 * proicons) es exclusivo de este feature y coincide con el botón del strip.
 */
const tabs: ActivityBarButton = {
  id: 'tabs',
  get label() {
    return t('layout.panel.tabs')
  },
  icon: productIcon('tabs'),
  side: 'left',
  target: 'left',
  panelId: 'tabs',
  order: 50
}

export default tabs
