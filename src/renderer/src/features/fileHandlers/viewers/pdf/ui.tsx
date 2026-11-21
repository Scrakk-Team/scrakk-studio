// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Visor de PDF: pdfjs renderiza cada página a un <canvas>. Sin plugin nativo,
 * sin `object-src`, con zoom y navegación de páginas.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import { readPreviewBinary } from '../../previewData'
import { loadPdfFromBase64 } from './extra'
import { baseNameOf } from '../../detect'
import styles from '../../viewers.module.css'
import pdfStyles from './pdf.module.css'

interface PdfDocument {
  numPages: number
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number }
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
  }>
}

export default function PdfViewer({ path }: FileHandlerViewProps): JSX.Element {
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let alive = true
    setDoc(null)
    setError(null)
    setPage(1)
    void (async () => {
      const res = await readPreviewBinary(path)
      if (!res.success || !res.base64) {
        if (alive) setError(res.error ?? 'No se pudo leer el PDF.')
        return
      }
      const loaded = (await loadPdfFromBase64(res.base64)) as PdfDocument
      if (alive) setDoc(loaded)
    })().catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      alive = false
    }
  }, [path])

  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let alive = true
    void (async () => {
      const pdfPage = await doc.getPage(page)
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas || !alive) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await pdfPage.render({ canvasContext: ctx, viewport }).promise
    })().catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      alive = false
    }
  }, [doc, page, scale])

  const go = useCallback(
    (delta: number) => {
      if (!doc) return
      setPage((p) => Math.min(doc.numPages, Math.max(1, p + delta)))
    },
    [doc]
  )

  if (error) return <div className={styles.view}><span className={styles.error}>{error}</span></div>
  if (!doc) return <div className={styles.view}><span className={styles.mediaTitle}>Cargando PDF…</span></div>

  return (
    <div className={styles.view}>
      <div className={pdfStyles.bar}>
        <button type="button" onClick={() => go(-1)} disabled={page <= 1}>‹</button>
        <span className={pdfStyles.page}>{page} / {doc.numPages}</span>
        <button type="button" onClick={() => go(1)} disabled={page >= doc.numPages}>›</button>
        <span className={pdfStyles.spacer} />
        <button type="button" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}>−</button>
        <span className={pdfStyles.page}>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}>+</button>
        <span className={pdfStyles.spacer} />
        <span className={pdfStyles.name}>{baseNameOf(path)}</span>
      </div>
      <div className={pdfStyles.scroll}>
        <canvas ref={canvasRef} className={pdfStyles.canvas} />
      </div>
    </div>
  )
}
