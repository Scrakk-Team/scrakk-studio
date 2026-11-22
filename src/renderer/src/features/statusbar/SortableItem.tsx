// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Wrapper que hace arrastrable un item de la status bar.
 *
 * HTML5 DnD con drag image INVISIBLE: no sale ningún fantasma flotante de la
 * barra. El reorden ocurre en vivo en `dragover` (según la mitad del item),
 * como al mover una pestaña del navegador: los items se deslizan dentro de la
 * barra y van cambiando de sitio. El orden se persiste en `order.ts`.
 */

import { useState, type JSX, type ReactNode } from 'react'
import { moveStatusBarItem } from './order'
import styles from './StatusBar.module.css'

/**
 * `dataTransfer.getData()` NO está disponible durante `dragover` (sólo en
 * `drop`, por seguridad del navegador). Guardamos el id a nivel módulo, como
 * hace el sistema de drag de la activitybar, para que el reorden en vivo sí
 * funcione.
 */
let draggedId: string | null = null

interface SortableItemProps {
  id: string
  children: ReactNode
  className?: string
}

/** 1×1 transparente: evita el ghost que se sale de la barra al arrastrar. */
const EMPTY_DRAG_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function SortableItem({ id, children, className }: SortableItemProps): JSX.Element {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={[styles.sortable, dragging ? styles.sortableDragging : null, className]
        .filter(Boolean)
        .join(' ')}
      data-sort-id={id}
      draggable
      onDragStart={(event) => {
        draggedId = id
        setDragging(true)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', id)
        const img = new Image()
        img.src = EMPTY_DRAG_IMAGE
        event.dataTransfer.setDragImage(img, 0, 0)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (!draggedId || draggedId === id) return
        const rect = event.currentTarget.getBoundingClientRect()
        const before = event.clientX < rect.left + rect.width / 2
        moveStatusBarItem(draggedId, id, before)
      }}
      onDrop={(event) => event.preventDefault()}
      onDragEnd={() => {
        draggedId = null
        setDragging(false)
      }}
    >
      {children}
    </div>
  )
}
