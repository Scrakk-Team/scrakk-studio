// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección "Proveedores" — el panel real de proveedores dentro de Ajustes.
 * Reemplaza al modal viejo: mismo componente, otra puerta.
 */

import type { JSX } from 'react'
import { ProvidersPanel } from '@features/providers'
import styles from './ChatSections.module.css'
import { t } from '@core/i18n'

export function ProvidersSection(): JSX.Element {
  return (
    <div className={styles.section}>
      <div className={styles.headerText}>
        <h3>{t('settings.nav.providers')}</h3>
      </div>
      <ProvidersPanel />
    </div>
  )
}
