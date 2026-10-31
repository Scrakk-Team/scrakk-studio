// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Estado del explorer guardado por proyecto y las rutas relativas que lo
 * hacen portable (el id de `.scrakk/history/id.json` sigue a la carpeta).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stub de localStorage ANTES de tocar el storage (los accesos son en runtime).
const mem = new Map<string, string>()
vi.stubGlobal('window', {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    }
  }
})

import {
  PROJECT_STORAGE_SCOPES,
  getPersistedProjectExplorerExpanded,
  persistProjectExplorerExpanded,
  projectStorageKey
} from '../src/renderer/src/services/storage'
import {
  relativeToRoot,
  resolveFromRoot
} from '../src/renderer/src/features/explorer/utils/fileUtils'

function storageKey(projectId: string): string {
  return `scrakk:${projectStorageKey(
    projectId,
    PROJECT_STORAGE_SCOPES.EXPLORER_EXPANDED
  )}`
}

beforeEach(() => {
  mem.clear()
})

describe('project storage — carpetas expandidas del explorer', () => {
  it('guarda y lee por id de proyecto sin mezclar proyectos', () => {
    persistProjectExplorerExpanded('proyecto-a', ['src', 'src/components'])
    persistProjectExplorerExpanded('proyecto-b', ['lib'])

    expect(getPersistedProjectExplorerExpanded('proyecto-a')).toEqual([
      'src',
      'src/components'
    ])
    expect(getPersistedProjectExplorerExpanded('proyecto-b')).toEqual(['lib'])
    expect(getPersistedProjectExplorerExpanded('proyecto-c')).toEqual([])
  })

  it('usa una clave namespaced con el id', () => {
    persistProjectExplorerExpanded('proyecto-a', ['src'])

    expect(storageKey('proyecto-a')).toBe(
      'scrakk:project.proyecto-a.explorer.expanded'
    )
    expect(mem.get(storageKey('proyecto-a'))).toBe(JSON.stringify(['src']))
    expect(mem.has(storageKey('proyecto-b'))).toBe(false)
  })

  it('deduplica, descarta valores inválidos y limita el tamaño', () => {
    persistProjectExplorerExpanded('p', [
      'src',
      'src',
      '',
      'lib',
      42 as unknown as string,
      'x'.repeat(5000)
    ])

    expect(getPersistedProjectExplorerExpanded('p')).toEqual(['src', 'lib'])

    const many = Array.from({ length: 510 }, (_, i) => `folder-${i}`)
    persistProjectExplorerExpanded('p', many)
    const stored = getPersistedProjectExplorerExpanded('p')
    expect(stored).toHaveLength(500)
    expect(stored[0]).toBe('folder-0')
    expect(stored[499]).toBe('folder-499')
  })

  it('tolera JSON roto o una forma que no es un array', () => {
    mem.set(storageKey('roto'), '{broken')
    expect(getPersistedProjectExplorerExpanded('roto')).toEqual([])

    mem.set(storageKey('objeto'), JSON.stringify({ src: true }))
    expect(getPersistedProjectExplorerExpanded('objeto')).toEqual([])
  })

  it('ignora un id vacío', () => {
    persistProjectExplorerExpanded('', ['src'])
    expect(getPersistedProjectExplorerExpanded('')).toEqual([])
    expect(mem.size).toBe(0)
  })
})

describe('rutas relativas del explorer', () => {
  it('convierte ida y vuelta desde una raíz POSIX', () => {
    expect(relativeToRoot('/home/me/proyecto', '/home/me/proyecto/src')).toBe('src')
    expect(
      relativeToRoot('/home/me/proyecto', '/home/me/proyecto/src/components')
    ).toBe('src/components')
    expect(resolveFromRoot('/home/me/proyecto', 'src/components')).toBe(
      '/home/me/proyecto/src/components'
    )
  })

  it('soporta raíces Windows y separadores mezclados', () => {
    expect(relativeToRoot('C:\\work\\proyecto', 'C:\\work\\proyecto\\src')).toBe('src')
    expect(
      relativeToRoot('C:\\work\\proyecto', 'C:\\work\\proyecto/src/components')
    ).toBe('src/components')
    expect(resolveFromRoot('C:\\work\\proyecto', 'src/components')).toBe(
      'C:\\work\\proyecto/src/components'
    )
  })

  it('maneja la raíz del filesystem POSIX', () => {
    expect(relativeToRoot('/', '/etc')).toBe('etc')
    expect(resolveFromRoot('/', 'etc')).toBe('/etc')
  })

  it('rechaza rutas fuera de la raíz o con segmentos peligrosos', () => {
    expect(relativeToRoot('/home/me/proyecto', '/home/me/otro')).toBeNull()
    expect(relativeToRoot('/home/me/proyecto', '/home/me/proyecto2/src')).toBeNull()
    expect(resolveFromRoot('/home/me/proyecto', '../etc')).toBeNull()
    expect(resolveFromRoot('/home/me/proyecto', 'src/../../etc')).toBeNull()
    expect(resolveFromRoot('/home/me/proyecto', '/etc/passwd')).toBeNull()
    expect(resolveFromRoot('/home/me/proyecto', 'C:\\Windows')).toBeNull()
  })

  it('la raíz misma es una ruta relativa vacía', () => {
    expect(relativeToRoot('/home/me/proyecto', '/home/me/proyecto')).toBe('')
    expect(resolveFromRoot('/home/me/proyecto', '')).toBeNull()
  })
})
