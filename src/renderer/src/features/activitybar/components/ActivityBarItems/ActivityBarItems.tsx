// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Botones de la Activity Bar: dibuja la lista en los tres modos (normal,
 * centrado y rueda 3D). Toda la lógica visual del modo vive acá; la barra
 * (`ActivityBar.tsx`) sólo decide QUÉ botones mostrar y qué panel abrir.
 *
 * En modo rueda el botón central manda: arriba/abajo se desvanecen y la
 * rueda del mouse mueve el centro (y por lo tanto el panel seleccionado).
 */

import { useEffect, useRef, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import { preloadPanel } from '@features/layout'
import { sanitizeSvgIcon } from '@services/extensions/svgIcon'
import type { ActivityBarMode } from '@services/activityBarSettings'
import type { ActivityBarButton } from '../../types'
import { consumeDragClick } from '../../buttonDrag'
import { getActivityBadge } from '../../badges'
import barStyles from '../../ActivityBar.module.css'
import styles from './ActivityBarItems.module.css'

/** Altura de cada paso de la rueda 3D (px). */
const WHEEL_STEP = 40

interface ActivityBarItemsProps {
  buttons: ActivityBarButton[]
  activePanelId: string | null
  mode: ActivityBarMode
  centerIndex: number
  onCenterIndexChange: (index: number) => void
  ghostId: string | null
  onButtonPointerDown: (event: ReactPointerEvent, id: string) => void
  onActivate: (button: ActivityBarButton) => void
}

export function ActivityBarItems({
  buttons,
  activePanelId,
  mode,
  centerIndex,
  onCenterIndexChange,
  ghostId,
  onButtonPointerDown,
  onActivate
}: ActivityBarItemsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll = cambiar de panel. Listener nativo no-pasivo para poder
  // preventDefault (React registra 'wheel' como pasivo).
  useEffect(() => {
    if (mode !== 'wheel') return
    const container = containerRef.current
    if (!container) return
    const onWheel = (event: WheelEvent): void => {
      if (buttons.length === 0) return
      event.preventDefault()
      const delta = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0
      if (delta === 0) return
      const next = Math.max(0, Math.min(buttons.length - 1, centerIndex + delta))
      onCenterIndexChange(next)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [mode, buttons.length, centerIndex, onCenterIndexChange])

  const containerClass =
    mode === 'wheel' ? styles.wheel : mode === 'centered' ? styles.centered : styles.plain

  return (
    <div ref={containerRef} className={containerClass}>
      {buttons.map((button, index) => {
        const active = activePanelId === button.panelId
        const wheelCenter = mode === 'wheel' && index === centerIndex
        const offset = index - centerIndex
        const wheelStyle =
          mode === 'wheel'
            ? {
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) translateY(${offset * WHEEL_STEP}px) scale(${Math.max(0.62, 1 - Math.abs(offset) * 0.13)}) rotateX(${offset * -22}deg)`,
                opacity: Math.max(0.12, 1 - Math.abs(offset) * 0.32),
                zIndex: 20 - Math.abs(offset)
              }
            : undefined

        return (
          <button
            key={button.id}
            type="button"
            data-button-id={button.id}
            className={[
              barStyles.button,
              active ? barStyles.active : null,
              wheelCenter ? styles.wheelCenter : null,
              ghostId === button.id ? barStyles.dragging : null,
              mode === 'wheel' ? styles.wheelButton : null
            ].filter(Boolean).join(' ')}
            style={wheelStyle}
            title={button.label}
            aria-label={button.label}
            aria-pressed={active}
            onPointerEnter={() => preloadPanel(button.panelId)}
            onFocus={() => preloadPanel(button.panelId)}
            onPointerDown={(event) => {
              preloadPanel(button.panelId)
              onButtonPointerDown(event, button.id)
            }}
            onClick={() => {
              if (consumeDragClick(button.id)) return
              // En la rueda, clickear un botón que no está en el centro lo trae
              // al centro; el centro es el que manda (clicks para activar).
              if (mode === 'wheel' && !wheelCenter) {
                onCenterIndexChange(index)
                return
              }
              onActivate(button)
            }}
          >
            {typeof button.icon === 'string' ? (
              <span
                className={barStyles.svg}
                dangerouslySetInnerHTML={{ __html: sanitizeSvgIcon(button.icon) ?? '' }}
              />
            ) : (
              <button.icon size={20} />
            )}
            {getActivityBadge(button.id) > 0 ? (
              <span className={barStyles.badge}>
                {getActivityBadge(button.id) > 99 ? '99+' : getActivityBadge(button.id)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
