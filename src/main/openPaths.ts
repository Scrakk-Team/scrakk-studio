// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Apertura de rutas desde el explorador del sistema (Windows / Linux).
 *
 * El menú contextual del SO lanza el exe con la ruta como argumento. Este
 * módulo:
 *  - filtra `process.argv` para quedarse solo con rutas absolutas existentes
 *    (descarta flags de Electron, el `.` del dev server y valores de switches);
 *  - guarda las rutas en cola hasta que la ventana esté lista;
 *  - las entrega al renderer por IPC (push) o bajo demanda (pull) para que no
 *    se pierda el evento si el cliente aún no montó.
 *
 * Con single-instance, una segunda invocación llega como `second-instance` con
 * su propio argv; se encola igual y se envía a la ventana ya abierta.
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { ipcMain, type BrowserWindow } from 'electron'
import { APP_IPC, type OpenPathEntry, type OpenPathsPayload } from '@shared/app'

let pending: OpenPathEntry[] = []
let windowRef: BrowserWindow | null = null
/** El renderer ya reclamó la cola al menos una vez (montó su bridge). */
let rendererReady = false

/**
 * Quita el propio ejecutable y la entrada de la app (`electron .` en dev, o el
 * asar empaquetado) para que el directorio del proyecto no se abra como si
 * viniera del menú contextual.
 */
export function extractLaunchArgs(
  argv: string[],
  appPath?: string,
  exePath?: string
): string[] {
  return argv.slice(1).filter((arg) => arg !== '.' && arg !== appPath && arg !== exePath)
}

/** Convierte argv en entradas de ruta válidas (absolutas y existentes). */
export function parseOpenPaths(argv: string[]): OpenPathEntry[] {
  const out: OpenPathEntry[] = []
  for (const arg of argv) {
    if (!arg || arg.startsWith('-') || !isAbsolute(arg)) continue
    try {
      if (!existsSync(arg)) continue
      const full = resolve(arg)
      out.push({ path: full, isDirectory: statSync(full).isDirectory() })
    } catch {
      // Ruta inaccesible: se ignora, no tumba la apertura del resto.
    }
  }
  return out
}

function flush(): void {
  const win = windowRef
  if (!win || win.isDestroyed() || pending.length === 0) return
  const payload: OpenPathsPayload = { paths: pending }
  win.webContents.send(APP_IPC.openPaths, payload)
  // Antes de que el renderer monte, el evento puede perderse: conservar la
  // cola para que `takeOpenPaths` la reclame. Después, el push ya basta.
  if (rendererReady) pending = []
}

export function pushOpenPaths(entries: OpenPathEntry[]): void {
  if (entries.length === 0) return
  for (const entry of entries) {
    if (!pending.some((p) => p.path === entry.path)) pending.push(entry)
  }
  flush()
}

/**
 * Asocia la ventana y registra el handler de "pull". Llamar una vez, después
 * de crear la ventana principal.
 */
export function registerOpenPaths(win: BrowserWindow): void {
  windowRef = win
  ipcMain.handle(APP_IPC.takeOpenPaths, (): OpenPathsPayload => {
    rendererReady = true
    const payload: OpenPathsPayload = { paths: pending }
    pending = []
    return payload
  })
  // La ventana puede ya estar cargada (segunda instancia) o todavía no: el
  // pull del renderer cubre el arranque en frío, este push cubre el resto.
  flush()
}

export function resetOpenPathsForTests(): void {
  pending = []
  windowRef = null
  rendererReady = false
}
