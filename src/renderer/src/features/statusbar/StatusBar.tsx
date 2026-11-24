// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { SearchBar } from './components/SearchBar'
import { LspChip } from './components/LspChip/LspChip'
import { ProblemsChip } from './components/ProblemsChip/ProblemsChip'
import { GitChip } from './components/GitChip/GitChip'
import { CursorPosition } from './components/CursorPosition/CursorPosition'
import { ExtensionItems } from './components/ExtensionItems/ExtensionItems'
import { EncodingChip } from './components/EncodingChip/EncodingChip'
import { LayoutToggles } from './components/LayoutToggles/LayoutToggles'
import { NotificationsHistoryPanel } from '@features/notifications/NotificationsHistoryPanel'
import {
  showAnchoredModal,
  anchoredModalId,
  subscribeToModals,
  type AnchoredRect
} from '@services/modals'
import { SortableItem } from './SortableItem'
import {
  getStatusLeft,
  getStatusLayout,
  getStatusRight,
  subscribeToStatusBarOrder,
  isDragModeEnabled,
  toggleDragMode,
  subscribeToDragMode
} from './order'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import type { ContextMenuItem } from '@ui'
import styles from './StatusBar.module.css'

import { t } from '@core/i18n'
interface StatusBarProps {
  onOpenSettings: () => void
}

/** Key del popover de historial en el registry de modales (para toggle). */
const NOTIFICATIONS_POPOVER_KEY = 'notifications-history'

/**
 * Barra de estado inferior. Orden por defecto:
 *
 *   [lsp, git, problems, cursor, encoding, extensiones]   [layout] | campana, ajustes
 *                         ^ espacio en el centro ^
 *
 * El separador es fijo entre `layout` y las acciones de la derecha. Los items se reordenan en vivo
 * (estilo pestañas de navegador) SOLO si el usuario activó "Modo drageable"
 * desde el menú contextual de la barra (click derecho). El SearchBar flota
 * centrado.
 */
export function StatusBar({ onOpenSettings }: StatusBarProps): JSX.Element {
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [leftOrder, setLeftOrder] = useState<string[]>(getStatusLeft)
  const [layoutOrder, setLayoutOrder] = useState<string[]>(getStatusLayout)
  const [rightOrder, setRightOrder] = useState<string[]>(getStatusRight)
  const [dragMode, setDragMode] = useState(isDragModeEnabled)

  useEffect(() => subscribeToStatusBarOrder(() => {
    setLeftOrder(getStatusLeft())
    setLayoutOrder(getStatusLayout())
    setRightOrder(getStatusRight())
  }), [])

  useEffect(() => subscribeToDragMode(() => setDragMode(isDragModeEnabled())), [])

  useEffect(
    () =>
      subscribeToModals(() => {
        setPopoverOpen(anchoredModalId(NOTIFICATIONS_POPOVER_KEY) !== null)
      }),
    []
  )

  const toggleNotifications = (): void => {
    const button = bellRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const anchor: AnchoredRect = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
    showAnchoredModal({
      key: NOTIFICATIONS_POPOVER_KEY,
      title: t('statusbar.notificaciones'),
      anchor,
      width: 300,
      hideHeader: true,
      render: () => <NotificationsHistoryPanel />
    })
  }

  /**
   * Menú contextual global de la barra: habilita/deshabilita el arrastre.
   * Usa el mismo `showContextMenu` que el resto de la app; el `preventDefault`
   * evita que el fallback global (Copiar/Pegar) se abra encima.
   */
  const openContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    const items: ContextMenuItem[] = [
      {
        label: t('statusbar.modo.drageable'),
        checked: isDragModeEnabled(),
        onClick: () => toggleDragMode()
      }
    ]
    // 'above': la barra está abajo; el menú debe subir.
    showContextMenu(event.clientX, event.clientY, items, 'above')
  }

  /** Render de un item por id (nada hardcodeado en el orden). */
  const renderItem = (id: string): JSX.Element | null => {
    switch (id) {
      case 'lsp':
        return <LspChip />
      case 'git':
        return <GitChip />
      case 'problems':
        return <ProblemsChip />
      case 'cursor':
        return <CursorPosition />
      case 'encoding':
        return <EncodingChip />
      case 'ext-left':
        return <ExtensionItems alignment="left" />
      case 'layout':
        return <LayoutToggles />
      case 'bell':
        return (
          <button
            ref={bellRef}
            type="button"
            className={styles.chipBtn}
            aria-label={t('statusbar.historial.de.notificaciones')}
            aria-expanded={popoverOpen}
            title={t('statusbar.notificaciones')}
            data-anchored-anchor={NOTIFICATIONS_POPOVER_KEY}
            onClick={toggleNotifications}
          >
            <ProductIcon id="bell" size={14} />
          </button>
        )
      case 'settings':
        return (
          <button
            type="button"
            className={styles.chipBtn}
            aria-label={t('statusbar.ajustes')}
            title={t('statusbar.ajustes')}
            onClick={onOpenSettings}
          >
            <ProductIcon id="settings-gear" size={14} />
          </button>
        )
      default:
        return null
    }
  }

  return (
    <footer
      ref={barRef}
      className={styles.bar}
      data-chrome-bar="statusbar"
      aria-label={t('statusbar.barra.de.estado')}
      onContextMenu={openContextMenu}
    >
      {/* Izquierda: lsp, git, problems, cursor, encoding y extensiones. */}
      <div className={styles.group}>
        {leftOrder.map((id) => (
          <SortableItem
            key={id}
            id={id}
            dragEnabled={dragMode}
            getBarRect={() => barRef.current?.getBoundingClientRect() ?? null}
          >
            {renderItem(id)}
          </SortableItem>
        ))}
      </div>

      {/* ESPACIO EN EL CENTRO: empuja todo el bloque derecho al borde. No es
          un item arrastrable, es el hueco entre ambos grupos. */}
      <span className={styles.centerSpacer} aria-hidden="true" />

      {/* SearchBar flotante: centrado absoluto, sobre ese espacio. */}
      <SearchBar />

      {/* Toggles de panel, justo ANTES del separador. */}
      <div className={styles.group}>
        {layoutOrder.map((id) => (
          <SortableItem
            key={id}
            id={id}
            dragEnabled={dragMode}
            getBarRect={() => barRef.current?.getBoundingClientRect() ?? null}
          >
            {renderItem(id)}
          </SortableItem>
        ))}
      </div>

      {/* Separador FIJO entre `layout` y las acciones de la derecha. */}
      <span className={styles.separator} aria-hidden="true" />

      {/* Derecha: notificaciones → ajustes, SIEMPRE en ese orden y fijas. */}
      <div className={[styles.group, styles.groupRight].join(' ')}>
        {rightOrder.map((id) => (
          <SortableItem
            key={id}
            id={id}
            dragEnabled={false}
            getBarRect={() => barRef.current?.getBoundingClientRect() ?? null}
          >
            {renderItem(id)}
          </SortableItem>
        ))}
      </div>
    </footer>
  )
}
