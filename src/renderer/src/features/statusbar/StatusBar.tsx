// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { useEffect, useRef, useState, type JSX } from 'react'
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
import { getStatusLeft, getStatusRight, subscribeToStatusBarOrder } from './order'
import styles from './StatusBar.module.css'

import { t } from '@core/i18n'
interface StatusBarProps {
  onOpenSettings: () => void
}

/** Key del popover de historial en el registry de modales (para toggle). */
const NOTIFICATIONS_POPOVER_KEY = 'notifications-history'

/**
 * Barra de estado inferior. TODOS los items son arrastrables y se reordenan
 * en vivo dentro de la barra (estilo pestañas de navegador) según el orden
 * persistido en `order.ts`. El SearchBar sigue flotando centrado.
 */
export function StatusBar({ onOpenSettings }: StatusBarProps): JSX.Element {
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [leftOrder, setLeftOrder] = useState<string[]>(getStatusLeft)
  const [rightOrder, setRightOrder] = useState<string[]>(getStatusRight)

  useEffect(() => subscribeToStatusBarOrder(() => {
    setLeftOrder(getStatusLeft())
    setRightOrder(getStatusRight())
  }), [])

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

  /** Render de un item por id (nada hardcodeado en el orden). */
  const renderItem = (id: string): JSX.Element | null => {
    switch (id) {
      case 'lsp':
        return <LspChip />
      case 'git':
        return <GitChip />
      case 'problems':
        return <ProblemsChip />
      case 'sep-left':
        return <span className={styles.separator} aria-hidden="true" />
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
    <footer className={styles.bar} aria-label={t('statusbar.barra.de.estado')}>
      {/* Izquierda: items arrastrables entre sí (estilo pestañas). */}
      <div className={styles.group}>
        {leftOrder.map((id) => (
          <SortableItem key={id} id={id}>{renderItem(id)}</SortableItem>
        ))}
      </div>

      {/* SearchBar flotante: centrado absoluto, fuera del flujo de items. */}
      <SearchBar />

      {/* Separador FIJO entre ambos grupos (no se arrastra). */}
      <span className={[styles.separator, styles.separatorPush].join(' ')} aria-hidden="true" />

      {/* Derecha: actions fijas en su sitio (también se reordenan entre sí). */}
      <div className={[styles.group, styles.groupRight].join(' ')}>
        {rightOrder.map((id) => (
          <SortableItem key={id} id={id}>{renderItem(id)}</SortableItem>
        ))}
      </div>
    </footer>
  )
}
