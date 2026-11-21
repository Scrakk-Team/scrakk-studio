// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Información de archivo — panel del ToolDock.
 *
 * Muestra TODA la metadata del archivo activo: nombre, ruta, carpeta,
 * extensión, tipo, MIME, tamaño y fecha de modificación. La lógica vive en
 * `metadata.ts`; acá sólo se renderiza (patrón de los otros items del dock).
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import type { ToolDockPanelProps } from '../../types'
import {
  getFileMetadata,
  formatSize,
  formatModified,
  type FileMetadata
} from './metadata'
import styles from './FileInfoPanel.module.css'

import { t } from '@core/i18n'
import { api } from '@services/api'

export default function FileInfoPanel({ currentFile }: ToolDockPanelProps): JSX.Element {
  const [info, setInfo] = useState<FileMetadata | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!currentFile) {
      setInfo(null)
      return
    }
    setLoading(true)
    void getFileMetadata(currentFile.path).then((result) => {
      if (!cancelled) {
        setInfo(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [currentFile])

  if (!currentFile) {
    return <div className={styles.empty}>{t('features.fileinfo.sin.archivo')}</div>
  }
  if (loading) {
    return <div className={styles.empty}>{t('features.fileinfo.cargando')}</div>
  }
  if (!info) {
    return <div className={styles.empty}>{t('features.fileinfo.no.disponible')}</div>
  }

  const size = formatSize(info.sizeBytes)
  const modified = formatModified(info.modifiedMs)
  const rows: Array<{ label: string; value: string; mono?: boolean; title?: string }> = [
    { label: t('features.fileinfo.nombre'), value: info.name },
    { label: t('features.fileinfo.ruta'), value: info.path, mono: true, title: info.path },
    { label: t('features.fileinfo.carpeta'), value: info.dir || '—', mono: true, title: info.dir },
    { label: t('features.fileinfo.tipo'), value: t(`features.fileinfo.tipo.${info.kind}`) },
    { label: t('features.fileinfo.extension'), value: info.extension ? `.${info.extension}` : '—', mono: true },
    { label: t('features.fileinfo.mime'), value: info.mime ?? '—', mono: true },
    ...(size ? [{ label: t('features.fileinfo.tamano'), value: size }] : []),
    ...(modified ? [{ label: t('features.fileinfo.modificado'), value: modified }] : [])
  ]

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <span className={styles.icon}>
          <ProductIcon id={info.kind === 'directory' ? 'folder' : 'file-text'} size={16} />
        </span>
        <span className={styles.headName} title={info.name}>{info.name}</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <span
            className={[styles.value, row.mono ? styles.mono : null].filter(Boolean).join(' ')}
            title={row.title}
          >
            {row.value}
          </span>
        </div>
      ))}
      <button
        type="button"
        className={styles.reveal}
        onClick={() => void api?.fs?.openInFolder?.(info.path)}
      >
        <ProductIcon id="folder" size={13} />
        {t('features.fileinfo.mostrar.en.explorador')}
      </button>
    </div>
  )
}
