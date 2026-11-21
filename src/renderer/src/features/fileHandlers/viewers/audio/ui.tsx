// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import { baseNameOf } from '../../detect'
import { useMediaUrl } from '../_shared/useMediaUrl'
import styles from '../../viewers.module.css'

/** Reproductor de audio nativo. */
export default function AudioViewer({ path }: FileHandlerViewProps): JSX.Element {
  const { src, error, onMediaError } = useMediaUrl(path)
  return (
    <div className={styles.view}>
      <div className={styles.media}>
        <div className={styles.mediaTitle}>{baseNameOf(path)}</div>
        <audio src={src} controls preload="metadata" onError={onMediaError} />
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
    </div>
  )
}
