// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Esquema de streaming para los visores (`scrakk-file://`).
 *
 * Electron sirve el archivo con `registerFileProtocol` (stream real, seek y
 * Range), así que un MP4 grande NO viaja en base64 por IPC. El renderer sólo
 * puede pedir rutas dentro de las roots que él mismo autoriza (workspace +
 * temp de preview); cualquier otra cosa se rechaza. Sin este jail, un script
 * en el renderer podría leer ~/.ssh/id_rsa con un <img src>.
 */

import { app, ipcMain, protocol, session } from 'electron'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PREVIEW_IPC } from '@shared/preview'

const SCHEME = 'scrakk-file'

/** Roots autorizadas. El renderer las envía al abrir/actualizar el workspace. */
let roots: string[] = []

function tempRoot(): string {
  const dir = path.join(app.getPath('temp'), 'scrakk-preview')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Si no se puede crear, el jail igual funciona con las roots del workspace.
  }
  return dir
}

function normalize(value: string): string {
  return path.resolve(value.replace(/\\/g, '/'))
}

function isAllowed(filePath: string): boolean {
  const target = normalize(filePath)
  return roots.some((root) => {
    const base = normalize(root)
    return target === base || target.startsWith(base + path.sep)
  })
}

/** Decodifica `scrakk-file://preview/<encodeURIComponent(abs path)>`. */
function decodeRequest(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${SCHEME}:`) return null
    const raw = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return raw || null
  } catch {
    return null
  }
}

/** Registrar el esquema ANTES de ready (privilegios). */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Registrar el handler y el IPC de roots, ya con la sesión lista. */
export function registerPreviewProtocol(): void {
  // Roots por defecto: temp de preview. El workspace se agrega vía IPC.
  roots = [tempRoot()]

  ipcMain.handle(PREVIEW_IPC.setRoots, (_event, input: unknown): boolean => {
    const incoming = input as { roots?: unknown }
    const list = Array.isArray(incoming?.roots) ? incoming.roots : []
    const valid = list.filter((r): r is string => typeof r === 'string' && r.length > 0).map(normalize)
    roots = [...new Set([tempRoot(), ...valid])]
    return true
  })

  session.defaultSession.protocol.registerFileProtocol(SCHEME, (request, callback) => {
    const filePath = decodeRequest(request.url)
    if (!filePath || !isAllowed(filePath)) {
      callback({ error: -3 }) // ERR_FILE_NOT_FOUND
      return
    }
    callback({ path: filePath })
  })
}

/** Solo tests: resetear roots. */
export function _resetPreviewRootsForTests(): void {
  roots = []
}
