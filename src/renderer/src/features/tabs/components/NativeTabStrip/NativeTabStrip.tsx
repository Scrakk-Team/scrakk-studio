// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
//
// Tab strip nativo (C++/WASM de Innerta) dibujado DENTRO del contenedor del
// TabStrip de Scrakk, replicando la UI REAL de Scrakk (TabStrip.module.css +
// TabItem), no la del editor de escritorio.
//
// El tabsStore es la fuente de verdad: acá se empuja el snapshot SOLAMENTE
// cuando cambia (push), y el pointer sólo consulta hover/drag al core y
// repinta (paint). Empujar en cada movimiento era lo que causaba el lag.

import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type JSX,
  type MouseEvent
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tabsStore } from '../../store'
import type { TabSpec } from '../../types'
import { isFileDirty, activateFileSessionNow } from '@features/editor/fileSession'
import { getTabTitle, subscribeTabHeaders, tabHeaderKey } from '../../tabHeaders'
import { getFileIconUrl, subscribeToFileIcons } from '@services/fileIcons'
import { resolveProductIcon, subscribeToProductIcons } from '@services/productIcons/registry'
import { productIcon } from '@services/productIcons/components'
import { createNativeTabs, type NativeTabs, type NativeTabData } from '../../native/nativeTabs'
import { isTabWidthFixed, getTabWidth, subscribeToTabWidth } from '../../tabSize'
import { t } from '@core/i18n'
import styles from './NativeTabStrip.module.css'

interface NativeTabStripProps {
  stripId: string
  iconFor?: (tab: TabSpec) => ComponentType<{ size?: number }> | undefined
  onActivate: (tab: TabSpec) => void
  onClose: (tab: TabSpec) => void
  onContextMenu: (event: MouseEvent<Element>, tab: TabSpec) => void
}

function labelOf(tab: TabSpec, stripId: string): string {
  const published = getTabTitle(tabHeaderKey(stripId, tab.id))
  if (published) return published
  if (tab.label) return tab.label
  switch (tab.kind) {
    case 'welcome': return t('features.bienvenida')
    case 'file': return tab.filePath?.split(/[/\\]/).pop() ?? t('features.archivo')
    case 'terminal': return t('features.terminal')
    case 'panel': return tab.panelId ?? t('features.panel')
    case 'explorer': return tab.rootPath?.split(/[/\\]/).filter(Boolean).pop() ?? t('features.explorador')
    default: return tab.label ?? ''
  }
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function pxVar(name: string, fallback: number): number {
  const value = Number.parseFloat(cssVar(name, `${fallback}px`))
  return Number.isFinite(value) ? value : fallback
}

/** Fuente EXACTA del TabStrip (--text-sm + --font-sans del tema activo). */
function tabFont(): string {
  const size = cssVar('--text-sm', '13px')
  const family = cssVar('--font-sans', 'Inter, system-ui, sans-serif')
  return `${size} ${family}`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1)
  return `${out}…`
}

/** Rasteriza un ProductIcon (el mismo pipeline que el explorer) a imagen. */
function glyphImage(
  id: string,
  size: number,
  color: string,
  cache: Map<string, HTMLImageElement | null>
): HTMLImageElement | null {
  const key = `glyph:${id}|${size}|${color}`
  if (cache.has(key)) return cache.get(key) ?? null
  const resolved = resolveProductIcon(id)
  let url: string | null = null
  if (resolved?.kind === 'font') {
    cache.set(key, null)
    return null
  }
  const Component = resolved?.kind === 'component'
    ? productIcon(resolved.componentId)
    : null
  if (Component) {
    const markup = renderToStaticMarkup(createElement(Component, { size }))
      .replace(/currentColor/g, color)
    url = `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`
  }
  let img: HTMLImageElement | null = null
  if (url) {
    img = new Image()
    img.src = url
  }
  cache.set(key, img)
  return img
}

/** Iconos igual que el explorer nativo: file-icon theme + ProductIcon glyph. */
function iconImage(
  tab: TabSpec,
  label: string,
  iconFor: NativeTabStripProps['iconFor'],
  color: string,
  cache: Map<string, HTMLImageElement | null>
): HTMLImageElement | null {
  const key = `${tab.id}|${tab.kind}|${color}`
  if (cache.has(key)) return cache.get(key) ?? null

  let url: string | null = null
  if (tab.kind === 'file' && tab.filePath) {
    url = getFileIconUrl(label, { path: tab.filePath, isDirectory: false })
  }
  if (!url) {
    const Icon = tab.icon ?? iconFor?.(tab)
    if (Icon) {
      const markup = renderToStaticMarkup(createElement(Icon, { size: 14 }))
        .replace(/currentColor/g, color)
      url = `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`
    } else {
      const resolved = resolveProductIcon('file')
      if (resolved?.kind === 'font') {
        // Glyph de fuente: se dibuja en paint(); sin imagen que cachear.
        cache.set(key, null)
        return null
      }
      url = null
    }
  }
  let img: HTMLImageElement | null = null
  if (url) {
    img = new Image()
    img.src = url
  }
  cache.set(key, img)
  return img
}

export function NativeTabStrip({
  stripId,
  iconFor,
  onActivate,
  onClose,
  onContextMenu
}: NativeTabStripProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nativeRef = useRef<NativeTabs | null>(null)
  const dataRef = useRef<NativeTabData[]>([])
  const tabsRef = useRef<TabSpec[]>([])
  const iconCacheRef = useRef(new Map<string, HTMLImageElement | null>())
  const draggingRef = useRef(false)
  const frameRef = useRef(0)
  const signatureRef = useRef('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void createNativeTabs().then((instance) => {
      if (!alive) return
      nativeRef.current = instance
      setReady(true)
    })
    return () => {
      alive = false
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const push = useCallback((): void => {
    const ex = nativeRef.current
    const canvas = canvasRef.current
    if (!ex || !canvas) return
    const strip = tabsStore.getStrip(stripId)
    const tabs = strip?.tabs ?? []
    const measure = document.createElement('canvas').getContext('2d')
    if (measure) measure.font = tabFont()
    const data: NativeTabData[] = tabs.map((tab) => {
      const label = labelOf(tab, stripId)
      return {
        id: tab.id,
        label,
        flags:
          (strip?.activeId === tab.id ? 1 : 0) |
          (tab.closable !== false && !tab.fixed ? 2 : 0) |
          (tab.fixed ? 4 : 0) |
          (tab.deleted ? 8 : 0) |
          (tab.filePath && isFileDirty(tab.filePath) ? 16 : 0),
        labelWidth: measure ? measure.measureText(label).width : 0
      }
    })
    // Evitar subir el snapshot al WASM cuando nada cambió (p. ej. un emit
    // por activePath): sólo el highlight se activa en el core, sin rebuild.
    const signature = data.map((d) => `${d.id}\u0000${d.label}\u0000${d.flags}\u0000${d.labelWidth}`).join('\u0001')
    if (signature !== signatureRef.current) {
      signatureRef.current = signature
      ex.setTabs(data)
    }
    dataRef.current = data
    tabsRef.current = tabs
    const fixed = isTabWidthFixed() ? getTabWidth() : 0
    if (fixed > 0) ex.setFixedWidth(fixed)
    else ex.clearFixedWidth()
    ex.setViewport(canvas.clientWidth, canvas.clientHeight)
  }, [stripId])

  const paint = useCallback((): void => {
    const ex = nativeRef.current
    const canvas = canvasRef.current
    if (!ex || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const fontPx = pxVar('--text-sm', 12)
    const radius = pxVar('--radius-sm', 8)
    const space2 = pxVar('--space-2', 8)
    const colors = {
      bar: cssVar('--color-surface', '#101010'),
      activeBg: cssVar('--activitybar-bg', cssVar('--color-surface', '#101010')),
      hover: cssVar('--color-hover', 'rgba(255,255,255,0.08)'),
      text: cssVar('--color-text', '#e6e6e6'),
      muted: cssVar('--color-text-muted', '#8b949e'),
      accent: cssVar('--color-accent', '#58a6ff'),
      error: cssVar('--color-error', '#f14c4c'),
      border: cssVar('--color-border', '#30363d')
    }
    ctx.font = `${fontPx}px Inter, system-ui, sans-serif`
    ctx.textBaseline = 'middle'

    const data = dataRef.current
    const tabs = tabsRef.current
    const hovered = ex.hovered()

    // La tab arrastrada se pinta al final para quedar por encima del resto.
    const draggedIdx = ex.dragActive() ? ex.dragIndex() : -1
    const order = data.map((_, k) => k)
    if (draggedIdx >= 0 && draggedIdx < order.length) {
      order.splice(draggedIdx, 1)
      order.push(draggedIdx)
    }
    for (const i of order) {
      // Mientras se arrastra, ESA tab sigue al cursor dentro del container.
      const dx = ex.dragActive() && ex.dragIndex() === i ? ex.dragDx() : 0
      const left = ex.rowLeft(i) + dx
      const tw = ex.rowWidth(i)
      const flags = ex.flags(i)
      const active = (flags & 1) !== 0
      const closable = (flags & 2) !== 0
      const deleted = (flags & 8) !== 0
      const dirty = (flags & 16) !== 0
      const label = data[i].label
      const top = 4
      const innerH = 26
      const textColor = deleted ? colors.error : active || hovered === i ? colors.text : colors.muted
      // La tab activa YA está presionada: nunca toma el fondo de hover ni el
      // feedback de drag (antes parecía que se hundía al pasar el cursor).
      const dragging = !active && draggingRef.current && ex.hitIndex() === i

      if (active || (!active && (hovered === i || dragging))) {
        ctx.fillStyle = dragging
          ? cssVar('--color-surface-raised', colors.border)
          : active ? colors.activeBg : colors.hover
        roundRect(ctx, left, top, tw, innerH, radius)
        ctx.fill()
      }
      if (active) {
        // .tabActive::after: raya de acento con inset de --space-2.
        ctx.fillStyle = colors.accent
        roundRect(ctx, left + space2, h - 2, Math.max(0, tw - space2 * 2), 2, 2)
        ctx.fill()
      }

      // Icono (14px, gap 6, padding 12) — mismo registry que el explorer.
      const iconX = left + 12
      const iconY = top + (innerH - 14) / 2
      const img = iconImage(tabs[i], label, iconFor, textColor, iconCacheRef.current)
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, iconX, iconY, 14, 14)
      } else {
        const resolved = resolveProductIcon('file')
        if (resolved?.kind === 'font') {
          ctx.fillStyle = textColor
          ctx.font = `14px "${resolved.family}"`
          ctx.fillText(resolved.char, iconX, iconY + 7)
          ctx.font = `${fontPx}px Inter, system-ui, sans-serif`
        } else {
          ctx.fillStyle = textColor
          roundRect(ctx, iconX + 2, iconY + 2, 10, 10, 2)
          ctx.fill()
        }
      }

      const labelX = iconX + 14 + 6
      const labelRight = left + tw - (closable ? 26 : 12)
      const maxW = Math.max(0, labelRight - labelX)
      ctx.save()
      ctx.beginPath()
      ctx.rect(labelX - 1, top, maxW, innerH)
      ctx.clip()
      ctx.fillStyle = textColor
      ctx.font = `${deleted ? 'italic ' : ''}${fontPx}px Inter, system-ui, sans-serif`
      const shown = ellipsize(ctx, label, maxW)
      ctx.fillText(shown, labelX, top + innerH / 2)
      if (deleted) ctx.fillRect(labelX, top + innerH / 2, Math.min(ctx.measureText(shown).width, maxW), 1)
      ctx.restore()

      if (closable) {
        const cx = left + tw - 12
        const cy = top + innerH / 2
        if (dirty) {
          ctx.fillStyle = colors.text
          ctx.beginPath()
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // La X es el MISMO proicon que usa el TabStrip de Scrakk.
          const xIcon = glyphImage('x', 11, textColor, iconCacheRef.current)
          if (xIcon && xIcon.complete && xIcon.naturalWidth > 0) {
            ctx.drawImage(xIcon, cx - 5.5, cy - 5.5, 11, 11)
          } else {
            ctx.strokeStyle = textColor
            ctx.lineWidth = 1.2
            ctx.beginPath()
            ctx.moveTo(cx - 3, cy - 3)
            ctx.lineTo(cx + 3, cy + 3)
            ctx.moveTo(cx + 3, cy - 3)
            ctx.lineTo(cx - 3, cy + 3)
            ctx.stroke()
          }
        }
      }
    }
  }, [iconFor])

  const schedulePaint = useCallback((): void => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      paint()
    })
  }, [paint])

  // Tema y radius: repintar INMEDIATAMENTE, sin esperar a un re-render de
  // React (el explorer lo hace igual: el canvas lee los tokens al pintar).
  useEffect(() => {
    if (!ready) return
    const onTheme = (): void => {
      iconCacheRef.current.clear()
      schedulePaint()
    }
    // `activateTheme` publica este evento en el MISMO tick en que cambia los
    // tokens, así que el canvas repinta con el color/radius nuevos al instante.
    window.addEventListener('theme-changed', onTheme)
    return () => window.removeEventListener('theme-changed', onTheme)
  }, [ready, schedulePaint])

  useEffect(() => {
    if (!ready) return
    push()
    schedulePaint()
    const unsubTabs = tabsStore.subscribe(() => { push(); schedulePaint() })
    const unsubWidth = subscribeToTabWidth(() => { push(); schedulePaint() })
    const unsubHeaders = subscribeTabHeaders(() => { push(); schedulePaint() })
    const unsubIcons = subscribeToFileIcons(() => {
      iconCacheRef.current.clear()
      schedulePaint()
    })
    const unsubProduct = subscribeToProductIcons(() => {
      iconCacheRef.current.clear()
      schedulePaint()
    })
    const resize = new ResizeObserver(() => { push(); schedulePaint() })
    if (canvasRef.current) resize.observe(canvasRef.current)
    return () => {
      unsubTabs()
      unsubWidth()
      unsubHeaders()
      unsubIcons()
      unsubProduct()
      resize.disconnect()
    }
  }, [ready, push, schedulePaint])

  const tabsAt = useCallback((): TabSpec[] => tabsStore.getStrip(stripId)?.tabs ?? [], [stripId])

  const localPoint = (event: MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      role="tablist"
      aria-label={t('features.tabs.abiertas')}
      onPointerDown={(event) => {
        const ex = nativeRef.current
        if (!ex) return
        const { x, y } = localPoint(event)
        const kind = ex.hit(x, y)
        const tab = tabsAt()[ex.hitIndex()]
        if (kind === 2 && tab) {
          onClose(tab)
          return
        }
        if (kind === 1 && ex.hitIndex() >= 0) {
          // Switch en el pointerdown, como el explorer: el motor C++ ya tiene
          // el buffer y se activa SIN await, antes de que React re-renderice.
          if (tab?.filePath) activateFileSessionNow(tab.filePath)
          // El highlight se activa DENTRO del core nativo, en este mismo call
          // (no esperamos a que el store re-emita ni a un frame de paint).
          ex.setActive(ex.hitIndex())
          if (tab) onActivate(tab)
          // Repintar en el MISMO evento: el rAF mete un frame de retraso.
          paint()
          draggingRef.current = true
          ex.dragBegin(ex.hitIndex(), x, y)
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }}
      onPointerMove={(event) => {
        const ex = nativeRef.current
        if (!ex) return
        const { x, y } = localPoint(event)
        if (draggingRef.current) ex.dragMove(x, y)
        else ex.hover(x, y)
        paint()
      }}
      onPointerUp={(event) => {
        const ex = nativeRef.current
        if (!ex) return
        const wasDragging = draggingRef.current
        draggingRef.current = false
        if (!wasDragging) return
        const { x, y } = localPoint(event)
        ex.dragMove(x, y)
        if (ex.dragEnd() && ex.takeReorder()) {
          tabsStore.reorderTab(stripId, ex.reorderFrom(), ex.reorderTo())
          paint()
          return
        }
        // La activación ya ocurrió en pointerdown; acá sólo termina el drag.
        paint()
      }}
      onPointerLeave={() => {
        nativeRef.current?.hover(-1, -1)
        schedulePaint()
      }}
      onWheel={(event) => {
        nativeRef.current?.scroll(event.deltaY || event.deltaX)
        schedulePaint()
      }}
      onContextMenu={(event) => {
        const ex = nativeRef.current
        if (!ex) return
        const { x, y } = localPoint(event)
        ex.hit(x, y)
        const tab = tabsAt()[ex.hitIndex()]
        if (tab) onContextMenu(event, tab)
      }}
    />
  )
}
