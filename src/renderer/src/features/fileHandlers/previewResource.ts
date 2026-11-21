// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * URL de streaming para visores de Media/PDF.
 *
 * `scrakk-file://` es un esquema propio del main (registerFileProtocol) que
 * hace STREAMING del archivo: seek real y cero copias base64 por IPC, clave
 * para video/audio grandes. El main sólo sirve rutas dentro de las roots que
 * el renderer le autoriza (ver `main/previewProtocol.ts`).
 *
 * Si el esquema falla (ventana vieja, archivo fuera de root, tests), los
 * visores caen a un `data:` con `readBinary`, válido para archivos chicos.
 */

export const PREVIEW_SCHEME = 'scrakk-file'

/** URL de streaming para una ruta absoluta existente. */
export function previewFileUrl(path: string): string {
  return `${PREVIEW_SCHEME}://preview/${encodeURIComponent(path.replace(/\\/g, '/'))}`
}

/** URL `data:` de respaldo (base64 por IPC). */
export async function previewDataUrl(path: string): Promise<string> {
  const { readPreviewBinary } = await import('./previewData')
  const res = await readPreviewBinary(path)
  if (!res.success || !res.base64) throw new Error(res.error ?? 'No se pudo leer el archivo.')
  return `data:${res.mime ?? 'application/octet-stream'};base64,${res.base64}`
}
