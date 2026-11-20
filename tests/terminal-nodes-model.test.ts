// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { describe, expect, it } from 'vitest'
import {
  connectedGroups,
  edgePathForPorts,
  groupCentroid,
  portCountForSize,
  portPositions,
  portSide,
  smartEdgePath,
  spawnPosition,
  rectsOverlap,
  isRectVisible,
  cameraCenteredOn
} from '@features/layout/components/TerminalNodes/terminalNodesModel'

describe('portCountForSize', () => {
  it('nodo chico → pocos puertos, nodo grande → más', () => {
    const small = portCountForSize(360, 220)
    const big = portCountForSize(900, 600)
    expect(small).toBeGreaterThanOrEqual(4)
    expect(big).toBeGreaterThan(small)
    expect(big).toBeLessThanOrEqual(20)
  })
  it('respeta el mínimo de 4', () => {
    expect(portCountForSize(10, 10)).toBe(4)
  })
})

describe('portPositions', () => {
  it('reparte N puntos sobre el perímetro', () => {
    const w = 560
    const h = 340
    const pts = portPositions(w, h)
    expect(pts).toHaveLength(portCountForSize(w, h))
    for (const p of pts) {
      const onEdge =
        p.y === 0 || p.y === h || p.x === 0 || p.x === w
      expect(onEdge).toBe(true)
    }
  })
  it('toca los 4 lados en un nodo típico', () => {
    const pts = portPositions(560, 340)
    expect(pts.some((p) => p.y === 0)).toBe(true)
    expect(pts.some((p) => p.x === 560)).toBe(true)
    expect(pts.some((p) => p.y === 340)).toBe(true)
    expect(pts.some((p) => p.x === 0)).toBe(true)
  })
})

describe('connectedGroups', () => {
  it('une en cadena a-b-c en un solo grupo', () => {
    const groups = connectedGroups(['a', 'b', 'c', 'solo'], [
      { a: 'a', b: 'b' },
      { a: 'b', b: 'c' }
    ])
    const big = groups.find((g) => g.includes('a'))
    expect(big?.sort()).toEqual(['a', 'b', 'c'])
    expect(groups.find((g) => g.includes('solo'))).toEqual(['solo'])
  })
  it('ignora enlaces con extremos inexistentes', () => {
    const groups = connectedGroups(['a', 'b'], [{ a: 'a', b: 'fantasma' }])
    expect(groups).toHaveLength(2)
  })
})

describe('groupCentroid', () => {
  it('promedia los centros', () => {
    const c = groupCentroid(['a', 'b'], {
      a: { x: 0, y: 0, w: 100, h: 100 },
      b: { x: 100, y: 100, w: 100, h: 100 }
    })
    expect(c).toEqual({ x: 100, y: 100 })
  })
  it('null sin miembros válidos', () => {
    expect(groupCentroid(['x'], {})).toBeNull()
  })
})

describe('portSide', () => {
  it('clasifica cada borde', () => {
    expect(portSide(560, 340, { x: 10, y: 0 })).toBe('top')
    expect(portSide(560, 340, { x: 560, y: 10 })).toBe('right')
    expect(portSide(560, 340, { x: 10, y: 340 })).toBe('bottom')
    expect(portSide(560, 340, { x: 0, y: 10 })).toBe('left')
  })
})

describe('smartEdgePath', () => {
  it('genera cúbica que empieza/termina en anclas', () => {
    const d = smartEdgePath(0, 0, 'right', 200, 0, 'left')
    expect(d.startsWith('M 0 0 C')).toBe(true)
    expect(d.endsWith('200 0')).toBe(true)
  })
  it('misma dirección → bucle amplio (no recta aplastada)', () => {
    const facing = smartEdgePath(0, 0, 'right', 200, 0, 'left')
    const sameSide = smartEdgePath(0, 0, 'right', 200, 30, 'right')
    // El bucle en U usa controles más largos → d más largo que el S directo.
    expect(sameSide.length).toBeGreaterThan(facing.length)
    expect(sameSide).toContain('C')
  })
  it('edgePathForPorts sale perpendicular al lado', () => {
    const d = edgePathForPorts(
      { x: 0, y: 0, w: 560, h: 340 },
      { x: 560, y: 100 },
      { x: 800, y: 0, w: 560, h: 340 },
      { x: 0, y: 100 }
    )
    expect(d.startsWith('M 560 100 C')).toBe(true)
    // Control 1 hacia +x (normal derecha del origen).
    const m = d.match(/M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+),/)
    expect(m).not.toBeNull()
    expect(Number(m?.[3])).toBeGreaterThan(560)
  })
})

describe('spawnPosition / cámara del lienzo', () => {
  const size = { w: 560, h: 340 }
  it('nuevo nodo va AL LADO del último manipulado si está libre', () => {
    const anchor = { rect: { x: 100, y: 100, w: 560, h: 340 }, visible: true }
    const p = spawnPosition(anchor, { x: 800, y: 500 }, size, [anchor.rect])
    expect(p).toEqual({ x: 688, y: 100 })
    expect(rectsOverlap({ ...p, ...size }, anchor.rect, 28)).toBe(false)
  })
  it('si el lugar inmediato está ocupado, busca el hueco más cercano', () => {
    const a = { x: 100, y: 100, w: 560, h: 340 }
    const right = { x: 688, y: 100, w: 560, h: 340 }
    const p = spawnPosition(
      { rect: a, visible: true },
      { x: 900, y: 500 },
      size,
      [a, right]
    )
    expect(rectsOverlap({ ...p, ...size }, a, 28)).toBe(false)
    expect(rectsOverlap({ ...p, ...size }, right, 28)).toBe(false)
  })
  it('sin ancla visible usa el centro de la cámara', () => {
    const p = spawnPosition(null, { x: 1000, y: 700 }, size, [])
    expect(p.x).toBe(720)
    expect(p.y).toBe(530)
  })
  it('isRectVisible: fuera de cámara → false,dentro → true', () => {
    const vp = { w: 800, h: 600 }
    const cam = { x: 0, y: 0, k: 1 }
    expect(isRectVisible({ x: 20, y: 20, w: 560, h: 340 }, vp, cam)).toBe(true)
    expect(isRectVisible({ x: 900, y: 20, w: 560, h: 340 }, vp, cam)).toBe(false)
    expect(isRectVisible({ x: -30, y: 20, w: 560, h: 340 }, vp, cam)).toBe(false)
  })
  it('cameraCenteredOn deja el nodo en el centro del viewport', () => {
    const c = cameraCenteredOn(
      { x: 500, y: 300, w: 560, h: 340 },
      { w: 800, h: 600 },
      { x: 0, y: 0, k: 1 }
    )
    expect(c).toEqual({ x: 800 / 2 - 780, y: 600 / 2 - 470, k: 1 })
  })
})
