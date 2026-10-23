// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * useSelectionBox — caja de selección tipo "lasso" / rubber-band.
 *
 * OPTIMIZACIÓN CLAVE: manipulación directa del DOM (sin React state)
 * durante el drag, igual que Scrakk Code Editor. Solo se commitea
 * la selección al final en mouseUp.
 *
 * Patrón:
 *  - El div del selection box ya existe en el DOM (display: none).
 *  - En mousedown se muestra y posiciona via box.style.*
 *  - En mousemove se actualiza via box.style.* + classList en filas.
 *  - En mouseUp se commitea la selección final al state de React.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ROW_HEIGHT } from '../constants'

/** Franja de activación del autoscroll (px) desde el borde del contenedor. */
const AUTO_SCROLL_EDGE = 28
/** Velocidad máxima del autoscroll (px por frame) al fondo de la franja. */
const AUTO_SCROLL_MAX = 14

/**
 * Índices de filas que intersectan el rectángulo (matemática pura por
 * altura fija, sin DOM). Exportada para tests.
 */
export function lassoRowRange(
  rowCount: number,
  y: number,
  h: number
): { firstRow: number; lastRow: number } {
  return {
    firstRow: Math.max(0, Math.floor(y / ROW_HEIGHT) - 2),
    lastRow: Math.min(rowCount - 1, Math.ceil((y + h) / ROW_HEIGHT) + 2)
  }
}

/**
 * Paths intersectados por el rectángulo (matemática pura). Exportada para tests.
 */
export function lassoPaths(flatPaths: string[], rowCount: number, y: number, h: number): string[] {
  const { firstRow, lastRow } = lassoRowRange(rowCount, y, h)
  const sel: string[] = []
  for (let i = firstRow; i <= lastRow; i++) {
    if (i < flatPaths.length) {
      const path = flatPaths[i]
      const top = i * ROW_HEIGHT
      if (top + ROW_HEIGHT >= y && top <= y + h) {
        sel.push(path)
      }
    }
  }
  return sel
}

/**
 * Contexto que recibe la acción del recuadro de selección (`onLasso`).
 *
 * Existe para que el consumidor pueda **componer** en vez de reemplazar: `select`
 * es la acción por defecto (dejar esos paths como selección) y `additive` dice
 * si el usuario mantuvo Ctrl/Cmd.
 */
export interface LassoContext {
  /** Deja estos paths como selección (el comportamiento por defecto). */
  select: (paths: string[]) => void
  /** El usuario mantuvo Ctrl/Cmd: la selección se SUMA en vez de reemplazar. */
  additive: boolean
}

interface UseSelectionBoxOptions {
  /** Ref del contenedor scrolleable del árbol. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Ref del div del selection box (pre-rendered, display: none). */
  boxRef: RefObject<HTMLDivElement | null>
  /** Cantidad total de filas. */
  rowCount: number
  /** Paths de las filas en orden. */
  flatPaths: string[]
  /**
   * Callback al finalizar la selección (mouseUp).
   *
   * `additive` es `true` cuando el usuario mantuvo Ctrl/Cmd: en ese caso la
   * selección se **suma** a la que ya había, y `onClear` NO se llamó al empezar
   * (el consumidor decide cómo unirla).
   */
  onCommit: (paths: string[], additive: boolean) => void
  /** Callback al iniciar (para limpiar selección previa). Se omite en aditivo. */
  onClear: () => void
}

export function useSelectionBox({
  containerRef,
  boxRef,
  rowCount,
  flatPaths,
  onCommit,
  onClear
}: UseSelectionBoxOptions) {
  const isDragging = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingPaths = useRef<string[]>([])
  /** Ctrl/Cmd al empezar: la selección se SUMA a la existente. */
  const additiveRef = useRef(false)
  /**
   * Autoscroll tipo Explorador de Windows: mientras se arrastra el recuadro,
   * si el puntero entra en la franja superior/inferior del contenedor, éste
   * scrollea solo y la selección sigue creciendo. Se guarda la posición en
   * coordenadas de PANTALLA (no de contenido) para poder recalcular el
   * rectángulo en cada frame a medida que cambia `scrollTop`.
   */
  const lastClient = useRef<{ x: number; y: number } | null>(null)
  const autoScrollRaf = useRef<number | null>(null)

  // Refs "latest": los listeners de window se enganchan UNA vez (estables),
  // pero siempre leen los datos frescos del render actual. Sin esto, el
  // drag usaría flatPaths/rowCount/onCommit del primer render (rancios tras
  // cargar/expandir el árbol) y el commit seleccionaría mal o nada.
  const flatPathsRef = useRef(flatPaths)
  flatPathsRef.current = flatPaths
  const rowCountRef = useRef(rowCount)
  rowCountRef.current = rowCount
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  const getRelativePos = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const el = containerRef.current
      if (!el) return { x: 0, y: 0 }
      const rect = el.getBoundingClientRect()
      return {
        x: clientX - rect.left,
        y: clientY - rect.top + el.scrollTop
      }
    },
    [containerRef]
  )

  /** Calcula paths intersectados y actualiza el DOM directamente. */
  const updateSelection = useCallback(
    (boxState: { x: number; y: number; w: number; h: number }): void => {
      const el = containerRef.current
      if (!el) return

      const { y, h } = boxState
      const paths = lassoPaths(flatPathsRef.current, rowCountRef.current, y, h)
      const sel = new Set(paths)

      pendingPaths.current = paths

      // Merge visual DURANTE el drag (contiguas por índice): igual que el
      // post-commit, pero por classList directa (cero React state).
      const order = new Map<string, number>()
      flatPathsRef.current.forEach((path, index) => {
        if (!order.has(path)) order.set(path, index)
      })

      // Con Ctrl/Cmd la barrida se SUMA a lo que ya estaba seleccionado, así
      // que las filas previas también cuentan para las uniones: si la barrida
      // queda pegada a la selección anterior, no debe aparecer un borde en el
      // medio. Se lee del DOM por `aria-selected` (la clase del CSS module está
      // hasheada y no se puede consultar).
      const merge = new Set(sel)
      if (additiveRef.current) {
        for (const row of el.querySelectorAll('[aria-selected="true"]')) {
          const path = (row as HTMLElement).dataset.rowPath
          if (path) merge.add(path)
        }
      }

      // Actualizar clases directamente en el DOM (sin React state).
      const visibleRows = el.querySelectorAll('[data-row-path]')
      for (const row of visibleRows) {
        const path = (row as HTMLElement).dataset.rowPath
        if (path && sel.has(path)) {
          const index = order.get(path) ?? -1
          const list = flatPathsRef.current
          row.classList.add('row-selected-lasso')
          row.classList.toggle(
            'row-lasso-merge-top',
            index > 0 && merge.has(list[index - 1])
          )
          row.classList.toggle(
            'row-lasso-merge-bottom',
            index >= 0 && merge.has(list[index + 1])
          )
        } else {
          row.classList.remove('row-selected-lasso')
          row.classList.remove('row-lasso-merge-top')
          row.classList.remove('row-lasso-merge-bottom')
        }
      }
    },
    [containerRef]
  )

  /**
   * Aplica el arrastre actual (puntero en coords de pantalla) al rectángulo y
   * a la selección. Se usa tanto al mover el mouse como en cada frame del
   * autoscroll (donde el puntero está quieto pero `scrollTop` cambia).
   */
  const applyDrag = useCallback(
    (clientX: number, clientY: number): void => {
      const el = containerRef.current
      if (!el || !dragStart.current) return
      const rect = el.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top + el.scrollTop
      const sx = dragStart.current.x
      const sy = dragStart.current.y

      const left = Math.min(sx, cx)
      const top = Math.min(sy, cy)
      const w = Math.abs(cx - sx)
      const h = Math.abs(cy - sy)

      const box = boxRef.current
      if (box) {
        box.style.left = `${left}px`
        box.style.top = `${top}px`
        box.style.width = `${w}px`
        box.style.height = `${h}px`
      }

      if (w > 3 || h > 3) {
        updateSelection({ x: left, y: top, w, h })
      }
    },
    [containerRef, boxRef, updateSelection]
  )

  /** Detiene el loop de autoscroll (si está activo). */
  const stopAutoScroll = useCallback((): void => {
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current)
      autoScrollRaf.current = null
    }
  }, [])

  /**
   * Un frame de autoscroll: scrollea el contenedor según cuánto se haya
   * metido el puntero en la franja del borde y vuelve a aplicar el arrastre.
   * Sigue pidiendo frames mientras el puntero permanezca en la franja.
   */
  const autoScrollTick = useCallback((): void => {
    autoScrollRaf.current = null
    const el = containerRef.current
    const client = lastClient.current
    if (!isDragging.current || !el || !client) return

    const rect = el.getBoundingClientRect()
    const localY = client.y - rect.top

    let speed = 0
    if (localY < AUTO_SCROLL_EDGE) {
      // Arriba (incluye puntero por encima del contenedor).
      const depth = Math.min(1, (AUTO_SCROLL_EDGE - localY) / AUTO_SCROLL_EDGE)
      speed = -depth * AUTO_SCROLL_MAX
    } else if (localY > rect.height - AUTO_SCROLL_EDGE) {
      // Abajo (incluye puntero por debajo del contenedor).
      const depth = Math.min(1, (localY - (rect.height - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE)
      speed = depth * AUTO_SCROLL_MAX
    }

    if (speed === 0) return

    const maxScroll = el.scrollHeight - el.clientHeight
    const next = Math.max(0, Math.min(maxScroll, el.scrollTop + speed))
    if (next === el.scrollTop) {
      // Ya está en el tope (no hay nada que scrollear): parar hasta que el
      // próximo mousemove vuelva a entrar en la franja.
      return
    }
    el.scrollTop = next
    applyDrag(client.x, client.y)

    // Mantener el loop mientras haya margen para seguir scrolleando.
    autoScrollRaf.current = requestAnimationFrame(autoScrollTick)
  }, [containerRef, applyDrag])

  const handleMouseDown = useCallback(
    (event: React.MouseEvent): void => {
      // Lasso en CUALQUIER fondo del árbol (laterales, huecos, bajo las
      // filas): solo se excluyen las filas (click/drag nativo propio) y los
      // controles interactivos (botones, inputs).
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (
        target.closest('[data-row-path], button, input, textarea, select, a, [data-drag-ignore]')
      ) {
        return
      }
      if (event.button !== 0) return

      event.preventDefault()
      const pos = getRelativePos(event.clientX, event.clientY)
      dragStart.current = pos
      lastClient.current = { x: event.clientX, y: event.clientY }
      isDragging.current = true

      // Ctrl/Cmd = aditivo: NO se limpia lo seleccionado, así el recuadro sirve
      // para seguir sumando en vez de empezar de cero.
      const additive = event.ctrlKey || event.metaKey
      additiveRef.current = additive

      // Limpiar selección previa (solo si no es aditivo).
      if (!additive) onClearRef.current()

      // Mostrar y resetear el box via DOM directo.
      const box = boxRef.current
      if (box) {
        box.style.display = 'block'
        box.style.left = `${pos.x}px`
        box.style.top = `${pos.y}px`
        box.style.width = '0px'
        box.style.height = '0px'
      }
    },
    [getRelativePos, boxRef]
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent): void => {
      if (!isDragging.current || !dragStart.current) return

      lastClient.current = { x: event.clientX, y: event.clientY }

      // Dibujo throttled a un frame. El autoscroll tiene su propio loop y
      // reaplica el arrastre cada vez que mueve el scroll (el puntero puede
      // estar quieto).
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const client = lastClient.current
          if (!isDragging.current || !client) return
          applyDrag(client.x, client.y)
        })
      }

      // Encender el loop de autoscroll si no está corriendo; él mismo se
      // detiene cuando el puntero sale de la franja.
      if (autoScrollRaf.current === null) {
        autoScrollRaf.current = requestAnimationFrame(autoScrollTick)
      }
    },
    [applyDrag, autoScrollTick]
  )

  const handleMouseUp = useCallback((): void => {
    if (!isDragging.current) return

    isDragging.current = false
    dragStart.current = null
    lastClient.current = null
    stopAutoScroll()

    // Ocultar box via DOM directo.
    const box = boxRef.current
    if (box) {
      box.style.display = 'none'
    }

    // Limpiar clases de lasso de las filas.
    const el = containerRef.current
    if (el) {
      el.querySelectorAll('.row-selected-lasso').forEach((row) => {
        row.classList.remove('row-selected-lasso')
        row.classList.remove('row-lasso-merge-top')
        row.classList.remove('row-lasso-merge-bottom')
      })
    }

    // Commitear selección final al state de React.
    if (pendingPaths.current.length > 0) {
      onCommitRef.current(pendingPaths.current, additiveRef.current)
      pendingPaths.current = []
    }
    additiveRef.current = false

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [boxRef, containerRef, stopAutoScroll])

  // Listeners globales estables (con cleanup: StrictMode-safe). Leen los
  // refs latest, así el drag siempre usa el árbol actual.
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      // Desmontaje a mitad del drag: no dejar ningún rAF vivo.
      stopAutoScroll()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [handleMouseMove, handleMouseUp, stopAutoScroll])

  return { handleMouseDown }
}
