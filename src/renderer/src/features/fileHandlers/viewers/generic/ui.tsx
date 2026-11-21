// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import { readPreviewBinary } from '../../previewData'
import { baseNameOf } from '../../detect'
import { PreviewPlaceholder } from '../_shared/PreviewPlaceholder'
import { t } from '@core/i18n'

/** Placeholder para cualquier archivo binario sin visor dedicado. */
export default function GenericBinaryViewer({ path }: FileHandlerViewProps): JSX.Element {
  const [size, setSize] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    void readPreviewBinary(path).then((res) => {
      if (alive && res.success) setSize(res.size ?? null)
    })
    return () => {
      alive = false
    }
  }, [path])
  return (
    <PreviewPlaceholder
      icon="file"
      title={t('features.preview.generico.no.disponible', { name: baseNameOf(path) })}
      hint={
        size !== null
          ? t('features.preview.generico.detalle', { size: `${(size / 1024).toFixed(1)} KB` })
          : t('features.preview.binario.pronto')
      }
    />
  )
}
