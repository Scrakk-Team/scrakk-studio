// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Lógica de metadatos del panel "Información de archivo" (sin React).
 *
 * Sólo usa `fs.stat` (barato: nada de leer el archivo, clave para un MP4
 * grande). El MIME se deriva de la extensión y el resto del `StatResponse`.
 */

import { api } from '@services/api'

export interface FileMetadata {
  name: string
  path: string
  dir: string
  extension: string
  kind: 'file' | 'directory' | 'unknown'
  sizeBytes: number | null
  modifiedMs: number | null
  mime: string | null
}

/** MIME aproximado por extensión (suficiente para la etiqueta informativa). */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  md: 'text/markdown', txt: 'text/plain', json: 'application/json', xml: 'application/xml',
  html: 'text/html', css: 'text/css', js: 'text/javascript', ts: 'application/typescript',
  tsx: 'text/x-tsx', py: 'text/x-python', rs: 'text/rust', go: 'text/x-go',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  exe: 'application/x-msdownload', dll: 'application/x-msdownload', so: 'application/x-sharedlib'
}

function baseName(path: string): string {
  const clean = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return clean.slice(Math.max(clean.lastIndexOf('/'), 0) + 1) || clean
}

function dirName(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

function extensionOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Obtiene los metadatos de una ruta. Nunca lanza: fallos → `null`. */
export async function getFileMetadata(path: string): Promise<FileMetadata | null> {
  const stat = await api?.fs?.stat?.(path)
  if (!stat?.exists) return null
  const extension = extensionOf(path)
  return {
    name: baseName(path),
    path,
    dir: dirName(path),
    extension,
    kind: stat.isDirectory ? 'directory' : stat.isFile ? 'file' : 'unknown',
    sizeBytes: stat.isDirectory ? null : (stat.size ?? null),
    modifiedMs: stat.modifiedMs ?? null,
    mime: extension ? (MIME_BY_EXT[extension] ?? null) : null
  }
}

/** Tamaño legible (`1,3 KB`, `4,2 MB`…). `null` para carpetas/desconocido. */
export function formatSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

/** Fecha local legible. `null` si no hay timestamp. */
export function formatModified(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return null
  }
}
