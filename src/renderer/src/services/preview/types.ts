// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Contrato público de la API global de preview. */

import type {
  FileHandler,
  FileHandlerMatch,
  FileHandlerMode,
  FileViewMode
} from '@features/fileHandlers'

export type { FileHandler, FileHandlerMatch, FileHandlerMode, FileViewMode }

export interface PreviewOpenOptions {
  /** Forzar modo al abrir (por defecto el que decida el handler). */
  mode?: FileViewMode
  /** Título de la tab (por defecto el nombre del archivo). */
  title?: string
}

export interface PreviewBytesInput {
  bytes: Uint8Array | ArrayBuffer
  /** Nombre con extensión, para que el registry elija visor. */
  filename: string
  mime?: string
  title?: string
}

export interface PreviewApi {
  /** Registra un visor (o reemplaza uno con el mismo id). Devuelve la baja. */
  register: (handler: FileHandler) => () => void
  unregister: (id: string) => void
  /** Visor que corresponde a una ruta. */
  resolve: (path: string) => FileHandler | null
  list: () => FileHandler[]
  /** Abre una ruta en una tab del editor, en modo visor si aplica. */
  open: (path: string, opts?: PreviewOpenOptions) => void
  /** Guarda bytes en memoria y abre una tab virtual con ese nombre. */
  openBytes: (input: PreviewBytesInput) => string
  setMode: (path: string, mode: FileViewMode) => void
  close: (path: string) => void
  isPreviewing: (path: string) => boolean
  /** Actualiza las roots autorizadas del esquema de streaming. */
  setRoots: (roots: string[]) => Promise<boolean>
}
