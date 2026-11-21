// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Setup de pdfjs: el worker se sirve como asset local (?url de Vite) para que
 * no dependa de CDN y respete la CSP del renderer. Se configura UNA vez.
 */

import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let done = false

export default function setup(): void {
  if (done) return
  done = true
  GlobalWorkerOptions.workerSrc = workerUrl
}

/** Carga un PDF desde bytes ya leídos (base64 → Uint8Array). */
export async function loadPdfFromBase64(base64: string): Promise<unknown> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const { getDocument } = await import('pdfjs-dist')
  return getDocument({ data: bytes }).promise
}
