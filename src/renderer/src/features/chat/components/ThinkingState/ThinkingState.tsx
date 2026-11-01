// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { memo } from 'react'
import { Orb } from '../Orb/Orb'
import styles from './ThinkingState.module.css'

import { t } from '@core/i18n'
/** Indicador "Thinking": orb de lattice a la izquierda + shimmer — se
 *  muestra mientras el modelo piensa. */
export const ThinkingState = memo(function ThinkingState() {
  return (
    <span className={styles.wrap}>
      <Orb size={14} />
      <span className={styles.shimmer}>{t('chat.thinking')}</span>
    </span>
  )
})
