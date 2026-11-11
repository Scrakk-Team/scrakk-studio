// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import {
  isSkipFilesOnExpandAll,
  setSkipFilesOnExpandAll,
  subscribeExplorerSettings
} from '@services/explorerSettings'
import { t } from '@core/i18n'
import styles from './ExperimentalSection.module.css'

export function ExperimentalSection(): JSX.Element {
  const [skipFiles, setSkipFiles] = useState<boolean>(() => isSkipFilesOnExpandAll())

  useEffect(
    () =>
      subscribeExplorerSettings(() => {
        setSkipFiles(isSkipFilesOnExpandAll())
      }),
    []
  )

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h3>{t('settings.experimental')}</h3>
          <p>{t('settings.experimental.descripcion')}</p>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>
            {t('settings.expandir.todo.omitir.archivos')}
          </span>
          <span className={styles.rowHint}>
            {t('settings.expandir.todo.omitir.archivos.hint')}
          </span>
        </div>
        <ToggleSwitch
          checked={skipFiles}
          onChange={(next) => {
            setSkipFilesOnExpandAll(next)
            setSkipFiles(next)
          }}
          label={t('settings.expandir.todo.omitir.archivos')}
        />
      </div>
    </div>
  )
}
