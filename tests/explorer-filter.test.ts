// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del filtro de visibles del árbol (sección Cambios de git).
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ancestorDirs, filterRowsByPaths } from '../src/renderer/src/features/explorer/filter'

describe('ancestorDirs', () => {
  it('ancestros hasta el root (sin el root)', () => {
    expect(ancestorDirs('/r', ['/r/a/b/f.ts'])).toEqual(new Set(['/r/a/b', '/r/a']))
  })

  it('varios paths comparten ancestros (dedupe)', () => {
    expect(ancestorDirs('/r', ['/r/a/x.ts', '/r/a/y.ts'])).toEqual(new Set(['/r/a']))
  })

  it('archivo directo al root → sin ancestros', () => {
    expect(ancestorDirs('/r', ['/r/f.ts'])).toEqual(new Set())
  })

  it('paths fuera del root no expanden', () => {
    expect(ancestorDirs('/r', ['/otro/f.ts'])).toEqual(new Set(['/otro']))
  })
})

describe('filterRowsByPaths', () => {
  const flat = [
    { node: { path: '/r' } },
    { node: { path: '/r/a' } },
    { node: { path: '/r/a/f.ts' } },
    { node: { path: '/r/b.ts' } }
  ]

  it('visibles + ancestros, en orden', () => {
    const visible = new Set(['/r/a/f.ts', '/r/b.ts'])
    const ancestors = new Set(['/r/a'])
    expect(filterRowsByPaths(flat, visible, ancestors).map((r) => r.node.path)).toEqual([
      '/r/a',
      '/r/a/f.ts',
      '/r/b.ts'
    ])
  })

  it('vacío → vacío', () => {
    expect(filterRowsByPaths(flat, new Set(), new Set())).toEqual([])
  })
})

/**
 * Regresión de rendimiento del árbol filtrado (sección Cambios de git).
 *
 * La vista filtrada auto-expande los ancestros de los archivos que muestra. Se
 * hacía con `for (dir of ancestors) ensureExpanded(dir)`, y **cada**
 * `ensureExpanded` llamaba a `bump()` (un render). Con los cambios repartidos en
 * N carpetas eso era N renders, y cada render re-aplana el árbol completo: de
 * ahí el lag al abrir el panel de Git.
 *
 * Además el efecto dependía del objeto `workspace`, que cambia de identidad en
 * cada render, así que el bucle corría en TODOS los renders.
 *
 * Ahora hay `ensureExpandedMany` (un solo render para todas) y el efecto depende
 * del callback estable, no del objeto.
 */
describe('expansión en lote de ancestros (rendimiento)', () => {
  const read = (rel: string): string =>
    readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
  const WS = 'src/renderer/src/features/explorer/hooks/useWorkspaceState.ts'
  const PANEL = 'src/renderer/src/features/explorer/ExplorerPanel.tsx'

  it('existe el API en lote y está expuesto', () => {
    const ws = read(WS)
    expect(ws).toContain('ensureExpandedMany: (dirPaths: Iterable<string>) => void')
    expect(ws).toMatch(/const ensureExpandedMany = useCallback/)
    // Un solo bump para todas las carpetas nuevas.
    expect(ws).toMatch(/if \(changed\) \{\n\s*bump\(\)/)
    expect(ws).toMatch(/^    ensureExpandedMany,$/m)
  })

  it('el panel expande en una sola llamada y no depende del objeto workspace', () => {
    const panel = read(PANEL)
    expect(panel).toContain('workspace.ensureExpandedMany(ancestors)')
    // Ya no se llama ensureExpanded en bucle.
    expect(panel).not.toMatch(/for \(const dir of ancestors\) workspace\.ensureExpanded/)
    // El objeto `workspace` NO puede estar en las deps (cambia en cada render).
    const deps = panel.slice(panel.indexOf('workspace.ensureExpandedMany(ancestors)'))
    expect(deps.slice(0, 120)).toContain('workspace.ensureExpandedMany]')
  })
})
