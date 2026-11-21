// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Cartel compartido para formatos sin visor (binarios, desconocidos). */

import type { JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import styles from '../../viewers.module.css'
import placeholderStyles from './placeholder.module.css'

export function PreviewPlaceholder({
  icon = 'file',
  title,
  hint
}: {
  icon?: string
  title: string
  hint?: string
}): JSX.Element {
  return (
    <div className={styles.view}>
      <div className={placeholderStyles.root}>
        <span className={placeholderStyles.icon}>
          <ProductIcon id={icon} size={26} />
        </span>
        <p className={placeholderStyles.title}>{title}</p>
        {hint ? <p className={placeholderStyles.hint}>{hint}</p> : null}
      </div>
    </div>
  )
}
