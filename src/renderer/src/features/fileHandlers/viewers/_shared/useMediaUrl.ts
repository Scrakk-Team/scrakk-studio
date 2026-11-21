// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** hook compartido por audio/video: streaming primero, data: como respaldo. */

import { useCallback, useEffect, useState } from 'react'
import { previewDataUrl, previewFileUrl } from '../../previewResource'

export interface MediaUrlState {
  src: string
  error: string | null
  /** Llamar desde onError del elemento <audio>/<video> para probar data:. */
  onMediaError: () => void
}

export function useMediaUrl(path: string): MediaUrlState {
  const [src, setSrc] = useState(() => previewFileUrl(path))
  const [error, setError] = useState<string | null>(null)
  const [triedFallback, setTriedFallback] = useState(false)

  useEffect(() => {
    setSrc(previewFileUrl(path))
    setError(null)
    setTriedFallback(false)
  }, [path])

  const onMediaError = useCallback((): void => {
    if (triedFallback) {
      setError('No se pudo abrir el archivo multimedia.')
      return
    }
    setTriedFallback(true)
    void previewDataUrl(path).then(
      (url) => setSrc(url),
      () => setError('No se pudo abrir el archivo multimedia.')
    )
  }, [path, triedFallback])

  return { src, error, onMediaError }
}
