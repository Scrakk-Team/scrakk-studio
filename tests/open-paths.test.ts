// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Rutas del menú contextual del SO -> argumentos del proceso principal.
 * Solo deben abrirse rutas absolutas que existen: los switches de Electron,
 * el `.` del dev server y los valores de flags no son archivos.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() }
}))

const { parseOpenPaths, extractLaunchArgs } = await import('../src/main/openPaths')

const tempDirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scrakk-open-paths-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})

describe('parseOpenPaths', () => {
  it('abre solo rutas absolutas existentes, con su tipo', () => {
    const root = tempDir()
    const file = join(root, 'app.ts')
    const folder = join(root, 'src')
    writeFileSync(file, 'export {}\n')
    mkdirSync(folder)

    const parsed = parseOpenPaths([
      '/path/to/electron',
      '--no-sandbox',
      '--user-data-dir=/tmp/profile',
      '.',
      file,
      folder,
      join(root, 'missing.txt')
    ])

    expect(parsed.map((entry) => entry.path)).toEqual([file, folder])
    expect(parsed[0].isDirectory).toBe(false)
    expect(parsed[1].isDirectory).toBe(true)
  })

  it('devuelve vacío cuando argv no trae rutas de archivo', () => {
    expect(parseOpenPaths(['electron', '.', '--no-sandbox', '--disable-gpu'])).toEqual([])
  })

  it('no confunde la entrada de la app en dev con una carpeta del SO', () => {
    const root = '/home/me/BorealChat'
    const file = '/home/me/project/app.ts'
    expect(extractLaunchArgs(['electron', root, file], root, 'electron')).toEqual([file])
    expect(extractLaunchArgs(['electron', '.', file], root, 'electron')).toEqual([file])
  })
})
