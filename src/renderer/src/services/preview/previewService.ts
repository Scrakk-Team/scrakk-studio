// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * API GLOBAL DE PREVIEW — fachada sobre el registry de visores.
 *
 * Todo el contenido de las tabs pasa por acá: el editor (handler `text`),
 * imágenes, markdown, PDF, audio, video y binarios. Las extensiones pueden
 * registrar sus propios visores con `preview.register(...)`.
 */

import { api } from '@services/api'
import {
  effectiveMode,
  fileHandlerRegistry,
  setPreferredMode,
  type FileHandler
} from '@features/fileHandlers'
import { openFileInEditor, closeFile } from '@features/editor'
import { releaseBytes, storeBytes } from './memoryResources'
import type { PreviewApi, PreviewBytesInput, PreviewOpenOptions } from './types'

function nameOf(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function makeApi(): PreviewApi {
  return {
    register: (handler: FileHandler) => fileHandlerRegistry.register(handler),
    unregister: (id: string) => fileHandlerRegistry.unregister(id),
    resolve: (path: string) => fileHandlerRegistry.resolve(path),
    list: () => fileHandlerRegistry.list(),

    open: (path: string, opts?: PreviewOpenOptions): void => {
      const title = opts?.title ?? nameOf(path)
      openFileInEditor(path, title)
      if (opts?.mode) {
        const handler = fileHandlerRegistry.resolve(path)
        if (handler && handler.mode === 'both') setPreferredMode(path, opts.mode)
      }
    },

    openBytes: (input: PreviewBytesInput): string => {
      const path = storeBytes(input.bytes, input.filename, input.mime)
      openFileInEditor(path, input.title ?? input.filename)
      return path
    },

    setMode: (path: string, mode) => setPreferredMode(path, mode),

    close: (path: string): void => {
      closeFile(path)
      releaseBytes(path)
    },

    isPreviewing: (path: string): boolean => {
      const handler = fileHandlerRegistry.resolve(path)
      return effectiveMode(handler, path) === 'view'
    },

    setRoots: async (roots: string[]): Promise<boolean> => {
      const bridge = api?.preview
      if (!bridge || typeof bridge.setRoots !== 'function') return false
      return bridge.setRoots(roots)
    }
  }
}

export const preview: PreviewApi = makeApi()
