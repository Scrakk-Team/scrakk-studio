// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Wrapper que hace arrastrable un item de la status bar — SOLO cuando el
 * usuario activó "Modo drageable" desde el menú contextual (click derecho).
 *
 * Se usa POINTER events en vez de HTML5 DnD porque los chips son <button> y
 * Chromium NO inicia un drag desde un botón (por eso el `draggable` de antes
 * "parecía" pero no arrastraba). El item sigue al puntero dentro de la barra,
 * con el movimiento limitado a los bordes de la barra (nunca sale de ahí) y
 * el reorden ocurre en vivo, como al mover una pestaña del navegador. No hay
 * ghost flotante: es el propio item el que se desliza.
 */

import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { isDragModeEnabled, moveStatusBarItem } from './order'
import styles from './StatusBar.module.css'

interface DragState {
  pointerId: number
  startClientX: number
  /** Distancia desde el borde izquierdo del item hasta donde se agarró. */
  grabOffset: number
  barLeft: number
  barRight: number
  moved: boolean
}

interface SortableItemProps {
  id: string
  children: ReactNode
  className?: string
  /** Modo drageable activo (menú contextual de la barra). */
  dragEnabled: boolean
  /** Barra contenedora: para clampear el movimiento y no salir de ella. */
  getBarRect: () => DOMRect | null
}

export function SortableItem({
  id,
  children,
  className,
  dragEnabled,
  getBarRect
}: SortableItemProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)

  // Escuchas globales: sólo actúan si este item está siendo arrastrado.
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const state = dragRef.current
      if (!state || event.pointerId !== state.pointerId) return
      event.preventDefault()
      if (Math.abs(event.clientX - state.startClientX) > 2) state.moved = true
      const el = ref.current
      if (!el) return

      // Medimos la posición "home" SIN transform (el orden puede haber cambiado
      // entre movimientos) y colocamos el item bajo el cursor, clampado a la
      // barra para que nunca se salga de ella.
      el.style.transform = ''
      const home = el.getBoundingClientRect()
      const desiredLeft = event.clientX - state.grabOffset
      const clampedLeft = Math.max(state.barLeft, Math.min(desiredLeft, state.barRight - home.width))
      el.style.transform = `translateX(${clampedLeft - home.left}px)`

      // Reorden en vivo: si el cursor está sobre un hermano del mismo grupo,
      // movemos este item antes/después según la mitad que pisó.
      const parent = el.parentElement
      if (!parent) return
      for (const sib of parent.querySelectorAll<HTMLElement>('[data-sort-id]')) {
        if (sib === el) continue
        const targetId = sib.dataset.sortId
        if (!targetId) continue
        const rect = sib.getBoundingClientRect()
        if (event.clientX >= rect.left && event.clientX <= rect.right) {
          const before = event.clientX < rect.left + rect.width / 2
          moveStatusBarItem(id, targetId, before)
          break
        }
      }
    }

    const onUp = (event: PointerEvent): void => {
      const state = dragRef.current
      if (!state || event.pointerId !== state.pointerId) return
      if (state.moved) suppressClick.current = true
      dragRef.current = null
      setDragging(false)
      const el = ref.current
      if (el) el.style.transform = ''
      // El click que sigue a este pointerup se suprime; luego se limpia.
      window.setTimeout(() => { suppressClick.current = false }, 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [id])

  return (
    <div
      ref={ref}
      className={[
        styles.sortable,
        dragEnabled ? styles.sortableDragEnabled : null,
        dragging ? styles.sortableDragging : null,
        className
      ].filter(Boolean).join(' ')}
      data-sort-id={id}
      onPointerDown={(event) => {
        if (!isDragModeEnabled() || dragEnabled === false || event.button !== 0) return
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const bar = getBarRect()
        dragRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          grabOffset: event.clientX - rect.left,
          barLeft: bar?.left ?? rect.left,
          barRight: bar?.right ?? rect.right,
          moved: false
        }
        setDragging(true)
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.stopPropagation()
          event.preventDefault()
        }
      }}
    >
      {children}
    </div>
  )
}
