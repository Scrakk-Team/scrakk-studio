// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ActivityBarButton } from '../../types'
import { productIcon } from '@services/productIcons/components'

import { t } from '@core/i18n'
/**
 * Botón de "Tabs" — aparece SOLO en modo acoplado (`when: 'tabsDocked'`).
 * Abre el panel con la lista vertical de tabs. Su ícono (`panel-left`) es el
 * mismo que usa el botón del strip que activa el modo.
 */
const tabs: ActivityBarButton = {
  id: 'tabs',
  get label() {
    return t('layout.panel.tabs')
  },
  icon: productIcon('panel-left'),
  side: 'left',
  target: 'left',
  panelId: 'tabs',
  order: 50,
  when: 'tabsDocked'
}

export default tabs
