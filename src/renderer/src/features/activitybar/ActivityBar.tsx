// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Activity Bar — barra vertical de botones para activar/desactivar paneles.
 * Estados replicados del ActivityBar de Scrakk Code Editor:
 *  - Inactivo: ícono en tono muted, sin fondo.
 *  - Hover: color de texto + fondo sutil.
 *  - Activo: color acento + tinte del acento de fondo + indicador lateral
 *    de 3px que escala verticalmente.
 *
 * Mergea los botones registrados (registry estático) con los que aportan
 * las extensiones en runtime (ExtensionRegistry) — se re-renderiza al
 * instalarse o quitarse extensiones.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { useLayout } from '@features/layout'
import { ExtensionRegistry } from '@services/extensions'
import {
  getActivityBarMode,
  getDisabledActivitySide,
  subscribeToActivityBarSettings
} from '@services/activityBarSettings'
import {
  getExtensionContextKey,
  setExtensionContextKey,
  subscribeToExtensionContextKeys
} from '@services/extensions/hostBridge'
import { evaluateWhen } from '@services/extensions/when'
import { bindTabsDockedContext, setTabsDocked } from '@features/tabs'
import type { ActivityBarButton, ActivityBarSide } from './types'
import { activityButtonSlot, getOrderedButtons, subscribeToButtonLayout } from './layout'
import { startButtonDrag } from './buttonDrag'
import { DragGhost } from './DragGhost'
import { subscribeToActivityBadges } from './badges'
import { ActivityBarItems } from './components/ActivityBarItems/ActivityBarItems'
import styles from './ActivityBar.module.css'

import { t } from '@core/i18n'

export function ActivityBar({ side }: { side: ActivityBarSide }): JSX.Element | null {
  const { slots, setSlotPanel, toggleSlotPanel } = useLayout()
  const [version, setVersion] = useState(0)
  const [mode, setMode] = useState(getActivityBarMode)
  const [disabledSide, setDisabledSide] = useState(getDisabledActivitySide)
  const [centerIndex, setCenterIndex] = useState(0)
  // Fantasma que sigue al cursor durante el drag (null = sin drag).
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null)

  // Re-render cuando se instalan/remueven extensiones (botones de runtime).
  useEffect(() => {
    return ExtensionRegistry.subscribe(() => setVersion((v) => v + 1))
  }, [])
  useEffect(() => subscribeToButtonLayout(() => setVersion((v) => v + 1)), [])
  // Y cuando una feature publica un badge (no leídos, pendientes) para un botón.
  useEffect(() => subscribeToActivityBadges(() => setVersion((v) => v + 1)), [])
  // Y cuando una extensión cambia una clave de contexto: los botones con
  // `when` (vistas que se esconden según el estado) aparecen o se van.
  useEffect(() => subscribeToExtensionContextKeys(() => setVersion((v) => v + 1)), [])
  useEffect(
    () =>
      subscribeToActivityBarSettings(() => {
        setMode(getActivityBarMode())
        setDisabledSide(getDisabledActivitySide())
      }),
    []
  )

  // El estado "tabs acopladas" publica su clave de contexto con el hostBridge.
  // Se conecta ACÁ (la barra ya depende del hostBridge) y no en el store, para
  // que `@features/tabs` no arrastre servicios: `persistence` lo importa y sería
  // un ciclo. El botón `tabs` (when: 'tabsDocked') queda visible solo en modo
  // acoplado. Va en un efecto (no en el módulo) porque el hostBridge puede
  // estar a mitad de inicializar durante un ciclo de imports.
  useEffect(() => {
    bindTabsDockedContext((key, value) => setExtensionContextKey(key, value))
  }, [])

  // Una barra desactivada no se renderiza: sus botones pasan a la otra.
  const merged = disabledSide !== 'none' && disabledSide !== side
  const otherSide: ActivityBarSide = side === 'left' ? 'right' : 'left'

  const buttons = useMemo<ActivityBarButton[]>(() => {
    if (disabledSide === side) return []
    const own = getOrderedButtons(side)
    const list = merged ? [...own, ...getOrderedButtons(otherSide)] : own
    return list.filter((button) => evaluateWhen(button.when, getExtensionContextKey))
  }, [side, otherSide, merged, disabledSide, version])

  // La rueda necesita un índice central válido aunque cambien los botones.
  useEffect(() => {
    setCenterIndex((current) => Math.max(0, Math.min(current, Math.max(0, buttons.length - 1))))
  }, [buttons.length])

  /** Arranca el drag del botón (el controlador compartido mueve el layout). */
  function onButtonPointerDown(event: React.PointerEvent, id: string): void {
    // En modo rueda el drag chocaría con la animación 3D: se desactiva.
    if (mode === 'wheel') return
    startButtonDrag(event, id, {
      onStart: (draggedId) => setGhost({ id: draggedId, x: event.clientX, y: event.clientY }),
      onMove: (x, y) => setGhost((current) => (current ? { ...current, x, y } : { id, x, y })),
      onEnd: () => setGhost(null)
    })
  }

  /**
   * Activa el panel del botón en la barra visible (o la efectiva si hay drag).
   * `openOnly` abre/enfoca SIEMPRE (para la rueda: no queremos que el scroll
   * cierre el panel si ya estaba abierto).
   */
  const onActivate = useCallback(
    (button: ActivityBarButton, openOnly = false): void => {
      const targetSide = merged ? side : activityButtonSlot(button.id, side)
      // El botón "tabs" desacopla al cerrarse (el modo se activa desde el
      // botón del strip / comando, no desde acá).
      if (button.id === 'tabs' && slots[targetSide] === button.panelId && !openOnly) {
        setTabsDocked(false)
      }
      if (openOnly) setSlotPanel(targetSide, button.panelId)
      else toggleSlotPanel(targetSide, button.panelId)
    },
    [merged, side, slots, setSlotPanel, toggleSlotPanel]
  )

  const onCenterIndexChange = useCallback((index: number) => setCenterIndex(index), [])
  const onOpen = useCallback((button: ActivityBarButton) => onActivate(button, true), [onActivate])

  // Barra desactivada: fuera del layout (los botones los dibuja la otra).
  if (disabledSide === side) return null

  return (
    <nav
      className={[
        styles.bar,
        mode === 'centered' ? styles.centered : null,
        mode === 'wheel' ? styles.wheel : null
      ].filter(Boolean).join(' ')}
      data-side={side}
      data-chrome-bar="activitybar"
      aria-label={side === 'left' ? t('activitybar.barra.lateral.izquierda') : t('activitybar.barra.lateral.derecha')}
    >
      <ActivityBarItems
        buttons={buttons}
        activePanelId={slots[side]}
        mode={mode}
        centerIndex={centerIndex}
        onCenterIndexChange={onCenterIndexChange}
        onOpen={onOpen}
        ghostId={ghost?.id ?? null}
        onButtonPointerDown={onButtonPointerDown}
        onActivate={onActivate}
      />
      {ghost ? <DragGhost id={ghost.id} x={ghost.x} y={ghost.y} /> : null}
    </nav>
  )
}
