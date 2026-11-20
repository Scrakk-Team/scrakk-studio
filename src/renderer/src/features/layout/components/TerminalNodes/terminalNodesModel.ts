// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modelo puro del lienzo de terminales: puertos de unión dinámicos,
 * enlaces entre nodos y grupos conectados (para el agarrador grupal).
 * Sin React ni DOM: testeable en vitest.
 */

export interface PortPos { x: number; y: number }
export interface Link { id: string; a: string; b: string; ap: number; bp: number }

/** Total de puertos alrededor del perímetro: escala con el tamaño del nodo. */
export function portCountForSize(w: number, h: number): number {
  const n = Math.round((2 * (w + h)) / 220)
  return Math.min(20, Math.max(4, n))
}

/**
 * Reparte N puntos uniformemente por el perímetro del rectángulo
 * (empieza arriba-centro, sentido horario). Coordenadas relativas al nodo.
 */
export function portPositions(w: number, h: number): PortPos[] {
  const n = portCountForSize(w, h)
  const perimeter = 2 * (w + h)
  const pts: PortPos[] = []
  for (let i = 0; i < n; i++) {
    let d = (i / n) * perimeter
    // Lados: arriba (w) → derecha (h) → abajo (w) → izquierda (h).
    if (d < w) pts.push({ x: d, y: 0 })
    else if ((d -= w) < h) pts.push({ x: w, y: d })
    else if ((d -= h) < w) pts.push({ x: w - d, y: h })
    else { d -= w; pts.push({ x: 0, y: h - d }) }
  }
  return pts
}

/**
 * Lado del perímetro donde vive un puerto + su normal saliente.
 * Robusto a redondeos: elige el borde más cercano.
 */
export type PortSide = 'top' | 'right' | 'bottom' | 'left'

export interface NodeRect { x: number; y: number; w: number; h: number }
export interface NodePos { x: number; y: number }
export interface ViewportSize { w: number; h: number }

/** ¿Dos rects se solapan (con `gap` de aire)? */
export function rectsOverlap(a: NodeRect, b: NodeRect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  )
}

/**
 * Posición de un nodo NUEVO cerca del último que el usuario manipuló, o del
 * centro de la cámara si no hay / está fuera de vista. Prueba derecha, abajo,
 * izquierda, arriba y después un anillo creciente: siempre el hueco LIBRE más
 * cercano al ancla, para que la terminal nueva nunca se monte sobre otra.
 */
export function spawnPosition(
  anchor: { rect: NodeRect; visible: boolean } | null,
  focus: NodePos,
  size: NodeSizeLike,
  occupied: NodeRect[],
  gap = 28
): NodePos {
  const W = size.w
  const H = size.h
  const base = anchor?.visible ? anchor.rect : null
  const stepX = W + gap
  const stepY = H + gap
  const center = base
    ? { x: base.x + base.w / 2 - W / 2, y: base.y + base.h / 2 - H / 2 }
    : { x: focus.x - W / 2, y: focus.y - H / 2 }
  // Ancla visible: primero pegado a sus lados (el hueco "más cercano").
  const candidates: NodePos[] = base
    ? [
        { x: base.x + base.w + gap, y: base.y },
        { x: base.x, y: base.y + base.h + gap },
        { x: base.x - W - gap, y: base.y },
        { x: base.x, y: base.y - H - gap }
      ]
    : [{ x: center.x, y: center.y }]
  // Después, anillos alrededor del centro (tanto con ancla como sin ella).
  for (let ring = 1; ring <= 5; ring++) {
    for (const [dx, dy] of [
      [ring, 0], [0, ring], [-ring, 0], [0, -ring],
      [ring, ring], [ring, -ring], [-ring, ring], [-ring, -ring]
    ]) {
      candidates.push({ x: center.x + dx * stepX, y: center.y + dy * stepY })
    }
  }
  const free = candidates.find((p) =>
    !occupied.some((r) => rectsOverlap({ ...p, w: W, h: H }, r, gap))
  )
  return free ?? candidates[0] ?? { x: center.x, y: center.y }
}

interface NodeSizeLike { w: number; h: number }

/** Rect en coordenadas de PANTALLA según la cámara. */
export function rectToScreen(rect: NodeRect, cam: { x: number; y: number; k: number }): NodeRect {
  return {
    x: rect.x * cam.k + cam.x,
    y: rect.y * cam.k + cam.y,
    w: rect.w * cam.k,
    h: rect.h * cam.k
  }
}

/** ¿El nodo cabe en el viewport con `margin` de aire? */
export function isRectVisible(
  rect: NodeRect,
  viewport: ViewportSize,
  cam: { x: number; y: number; k: number },
  margin = 16
): boolean {
  const s = rectToScreen(rect, cam)
  return s.x >= margin && s.y >= margin &&
    s.x + s.w <= viewport.w - margin && s.y + s.h <= viewport.h - margin
}

/** Cámara que CENTRA el nodo en el viewport (sin cambiar zoom). */
export function cameraCenteredOn(
  rect: NodeRect,
  viewport: ViewportSize,
  cam: { x: number; y: number; k: number }
): { x: number; y: number; k: number } {
  return {
    k: cam.k,
    x: viewport.w / 2 - (rect.x + rect.w / 2) * cam.k,
    y: viewport.h / 2 - (rect.y + rect.h / 2) * cam.k
  }
}

export function portSide(w: number, h: number, p: PortPos): PortSide {
  const dTop = Math.abs(p.y)
  const dBottom = Math.abs(p.y - h)
  const dLeft = Math.abs(p.x)
  const dRight = Math.abs(p.x - w)
  const m = Math.min(dTop, dBottom, dLeft, dRight)
  if (m === dTop) return 'top'
  if (m === dBottom) return 'bottom'
  if (m === dLeft) return 'left'
  return 'right'
}

export function portNormal(side: PortSide): PortPos {
  if (side === 'top') return { x: 0, y: -1 }
  if (side === 'bottom') return { x: 0, y: 1 }
  if (side === 'left') return { x: -1, y: 0 }
  return { x: 1, y: 0 }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * Curva cúbica inteligente entre anclas de mundo.
 * - Controles sobre las normales salientes → sale/entra perpendicular.
 * - `k` adaptativo a distancia y orientación: lo más corto sin pinzarse.
 * - Mismo lado / espalda con espalda → bucle en U amplio, no recta cruzando nodos.
 */
export function smartEdgePath(
  ax: number, ay: number, aSide: PortSide,
  bx: number, by: number, bSide: PortSide
): string {
  const dx = bx - ax
  const dy = by - ay
  const dist = Math.hypot(dx, dy) || 1
  const na = portNormal(aSide)
  const nb = portNormal(bSide)
  const base = clamp(dist * 0.35, 32, 160)
  // ¿El otro extremo está en la dirección de mi normal? Si apunta
  // al lado contrario, alargar ese control para no plegar la curva.
  const towardsA = (dx * na.x + dy * na.y) / dist
  const towardsB = (-dx * nb.x + -dy * nb.y) / dist
  let kA = base * (1 + 0.8 * Math.max(0, -towardsA))
  let kB = base * (1 + 0.8 * Math.max(0, -towardsB))
  // Misma dirección (ej. der→der): U amplia en vez de S aplastada.
  if (na.x === nb.x && na.y === nb.y) {
    const wide = dist * 0.5 + 48
    if (kA < wide) kA = wide
    if (kB < wide) kB = wide
  }
  const c1x = round1(ax + na.x * kA)
  const c1y = round1(ay + na.y * kA)
  const c2x = round1(bx + nb.x * kB)
  const c2y = round1(by + nb.y * kB)
  return `M ${round1(ax)} ${round1(ay)} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${round1(bx)} ${round1(by)}`
}

/**
 * Conveniencia: anclas + lados a partir de rects de mundo y puertos
 * relativos. Es lo que usa la vista y el loop físico (rAF).
 */
export function edgePathForPorts(rectA: NodeRect, portA: PortPos, rectB: NodeRect, portB: PortPos): string {
  const ax = rectA.x + portA.x
  const ay = rectA.y + portA.y
  const bx = rectB.x + portB.x
  const by = rectB.y + portB.y
  return smartEdgePath(ax, ay, portSide(rectA.w, rectA.h, portA), bx, by, portSide(rectB.w, rectB.h, portB))
}

/**
 * Componentes conexas (union-find) sobre los ids dados y los enlaces.
 * Solo considera enlaces con AMBOS extremos presentes.
 */
export function connectedGroups(ids: string[], links: Array<Pick<Link, 'a' | 'b'>>): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = parent.get(x) ?? x
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root) as string
    // Compresión de camino.
    let cur = x
    while (cur !== root) {
      const next = parent.get(cur) ?? root
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const known = new Set(ids)
  for (const link of links) {
    if (known.has(link.a) && known.has(link.b)) union(link.a, link.b)
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    const arr = groups.get(root)
    if (arr) arr.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()]
}

/**
 * Centroide de los CENTROS de los miembros (para el agarrador grupal).
 * `rects`: id → {x, y, w, h} en coords de mundo.
 */
export function groupCentroid(members: string[], rects: Record<string, { x: number; y: number; w: number; h: number }>): { x: number; y: number } | null {
  const valid = members.filter((m) => rects[m])
  if (valid.length === 0) return null
  let sx = 0
  let sy = 0
  for (const m of valid) {
    sx += rects[m].x + rects[m].w / 2
    sy += rects[m].y + rects[m].h / 2
  }
  return { x: sx / valid.length, y: sy / valid.length }
}
