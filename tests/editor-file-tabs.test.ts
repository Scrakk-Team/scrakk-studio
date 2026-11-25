// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Renombrar / borrar archivos abiertos sin perder la tab ni la sesión. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) }
  }
})

const {
  openFileInEditor,
  activateFile,
  renameFileTab,
  markFileDeleted,
  getEditorFiles,
  closeFile
} = await import('../src/renderer/src/features/editor/editorBus')

beforeEach(() => {
  store.clear()
  for (const file of getEditorFiles().openFiles) closeFile(file.path)
})

describe('rename de un archivo abierto', () => {
  it('cambia path y nombre en la MISMA posición, y sigue activo', () => {
    openFileInEditor('/r/uno.txt', 'uno.txt')
    openFileInEditor('/r/dos.txt', 'dos.txt')
    activateFile('/r/uno.txt')
    renameFileTab('/r/uno.txt', '/r/renombrado.md', 'renombrado.md')

    const { openFiles, activePath } = getEditorFiles()
    expect(openFiles.map((f) => f.path)).toEqual(['/r/renombrado.md', '/r/dos.txt'])
    expect(openFiles[0].name).toBe('renombrado.md')
    expect(activePath).toBe('/r/renombrado.md')
  })

  it('no duplica ni crea una tab aparte', () => {
    openFileInEditor('/r/a.txt', 'a.txt')
    renameFileTab('/r/a.txt', '/r/b.txt', 'b.txt')
    expect(getEditorFiles().openFiles).toHaveLength(1)
    expect(getEditorFiles().openFiles[0].path).toBe('/r/b.txt')
  })
})

describe('archivo borrado', () => {
  it('marca la tab como borrada sin cerrarla', () => {
    openFileInEditor('/r/a.txt', 'a.txt')
    markFileDeleted('/r/a.txt')
    const { openFiles } = getEditorFiles()
    expect(openFiles).toHaveLength(1)
    expect(openFiles[0].deleted).toBe(true)
  })

  it('un rename limpia la marca de borrado', () => {
    openFileInEditor('/r/a.txt', 'a.txt')
    markFileDeleted('/r/a.txt')
    renameFileTab('/r/a.txt', '/r/b.txt', 'b.txt')
    expect(getEditorFiles().openFiles[0].deleted).toBe(false)
  })
})
