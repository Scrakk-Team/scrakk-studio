// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Visor de bytes en memoria: elige el elemento nativo según la extensión del
 * nombre guardado en el path virtual (`scrakk-view://bytes/<id>/<filename>`).
 */

import type { JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import { extensionOf } from '../../detect'
import { blobUrlFor } from '@services/preview/memoryResources'
import { PreviewPlaceholder } from '../_shared/PreviewPlaceholder'
import { t } from '@core/i18n'
import styles from '../../viewers.module.css'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg'])
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'])
const VIDEO = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi', 'ogv', 'm4v'])

export default function BytesViewer({ path }: FileHandlerViewProps): JSX.Element {
  const url = blobUrlFor(path)
  const filename = path.split('/').pop() ?? ''
  const ext = extensionOf(filename)
  if (!url) {
    return <PreviewPlaceholder icon="file" title={t('features.preview.bytes.caducado')} />
  }
  if (IMAGE.has(ext)) {
    return <div className={styles.view}><div className={styles.center}><img src={url} alt="" /></div></div>
  }
  if (AUDIO.has(ext)) {
    return <div className={styles.view}><div className={styles.media}><audio src={url} controls /></div></div>
  }
  if (VIDEO.has(ext)) {
    return <div className={styles.view}><div className={styles.media}><video src={url} controls /></div></div>
  }
  return (
    <div className={styles.view}>
      <div className={styles.media}>
        <a className={styles.download} href={url} download={filename}>{filename}</a>
      </div>
    </div>
  )
}
