// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Buffer en memoria para `preview.openBytes` (adjuntos, drops, PDFs generados). */

/** Prefijo virtual propio (evita importar fileHandlers → ciclo). */
const BYTES_SCHEME = 'scrakk-view://bytes/'

const blobs = new Map<string, Blob>()
const urls = new Map<string, string>()
let counter = 0

/** Guarda bytes y devuelve un path virtual `scrakk-view://bytes/<id>/<filename>`. */
export function storeBytes(bytes: Uint8Array | ArrayBuffer, filename: string, mime?: string): string {
  const id = `b${++counter}`
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const blob = new Blob([data as BlobPart], { type: mime || 'application/octet-stream' })
  blobs.set(id, blob)
  urls.set(id, URL.createObjectURL(blob))
  return `${BYTES_SCHEME}${id}/${encodeURIComponent(filename)}`
}

/** URL blob: del path virtual ('' si no existe o no es de bytes). */
export function blobUrlFor(path: string): string | undefined {
  const m = new RegExp(`^${BYTES_SCHEME}([^/]+)/`).exec(path)
  return m ? urls.get(m[1]) : undefined
}

/** Libera el blob de un path virtual. */
export function releaseBytes(path: string): void {
  const m = new RegExp(`^${BYTES_SCHEME}([^/]+)/`).exec(path)
  if (!m) return
  const url = urls.get(m[1])
  if (url) URL.revokeObjectURL(url)
  urls.delete(m[1])
  blobs.delete(m[1])
}
