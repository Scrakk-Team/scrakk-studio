// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
//
// Explorer panel — native renderer.
// The tree state and hit-testing live in the WASM core built from Innerta
// (src/Core/ui/explorer/wasm). This component owns the canvas, input and the
// bridge to the Electron filesystem / editor tabs.

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { getWorkspaceRoot } from './hooks/useWorkspaceState'
import { createNewFile, createNewFolder, openFolderViaDialog } from './fileActions'
import {
  isGitDecorationsVisible,
  setGitDecorationsVisible,
  subscribeToDecorations
} from './decorations'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import { t } from '@core/i18n'
import { ContextMenu, type ContextMenuItem } from '@ui'
import { openFileInEditor } from '@features/editor'
import { setResourceDragData } from '@features/dnd'
import { api } from '@services/api'
import { isSkipFilesOnExpandAll } from '@services/explorerSettings'
import { baseNameOf } from '@services/workspaces/history'
import { getFileIconUrl, subscribeToFileIcons } from '@services/fileIcons'
import { resolveProductIcon, subscribeToProductIcons } from '@services/productIcons'
import type { LassoContext } from './hooks/useSelectionBox'
import { createNativeExplorer, type NativeExplorer } from './native/nativeExplorer'
import styles from './ExplorerCanvas.module.css'

const ROW_HEIGHT = 22
const LIST_PAD_Y = 2
const INDENT = 12
const BASE_PAD = 8
/** Extra rows above/below the viewport (editor-style virtualization). */
const VIRTUAL_BUFFER = 12

interface ExplorerPanelProps {
  /** Root to show (explorer tabs spawned by drag & drop). */
  rootOverride?: string
  interactive?: boolean
  visiblePaths?: Set<string> | null
  onSelectionChange?: (paths: string[]) => void
  onOpenFile?: (path: string, name: string) => void
  rowActions?: unknown
  onLasso?: (paths: string[], ctx: LassoContext) => void
}

export function ExplorerPanel({
  rootOverride,
  onSelectionChange,
  onOpenFile,
  onLasso
}: ExplorerPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const explorerRef = useRef<NativeExplorer | null>(null)
  const lastDragRef = useRef(0)
  const [root, setRoot] = useState<string | null>(
    () => rootOverride ?? getWorkspaceRoot()
  )
  const [error, setError] = useState<string | null>(null)
  const iconCache = useRef(new Map<string, { img: HTMLImageElement | null; url: string | null }>())
  const chevronCache = useRef(new Map<string, HTMLImageElement>())
  const { setTitle, setActions } = usePanelTitle()
  const [gitBadges, setGitBadges] = useState(() => isGitDecorationsVisible())
  const [menu, setMenu] = useState<{
    x: number
    y: number
    row: { path: string; name: string; isDir: boolean; index: number; level: number } | null
  } | null>(null)
  // Native inline rename: value, caret and selection all live in the C++ core.
  // The canvas only measures glyphs and paints what the core reports.
  const textDragRef = useRef(false)
  // Native lasso: the core owns rectangle, hit-testing and preview selection.
  // These refs only carry the drag state between DOM events.
  const lassoDragRef = useRef(false)
  const lassoAdditiveRef = useRef(false)
  const lassoBaseRef = useRef<string[]>([])
  // Timestamp of the lasso release: the browser still emits a `click` on the
  // canvas afterwards (same element), which would click the row under the
  // pointer and destroy the selection. Suppress it.
  const lassoClickRef = useRef(0)

  const notifySelection = useCallback((): void => {
    onSelectionChange?.(explorerRef.current?.selection() ?? [])
  }, [onSelectionChange])

  const finishLasso = useCallback((): void => {
    const ex = explorerRef.current
    if (!ex || !lassoDragRef.current) return
    lassoDragRef.current = false
    // mouseup → click is emitted right after this; ignore that click.
    lassoClickRef.current = Date.now()
    const paths = ex.lassoPaths()
    const additive = lassoAdditiveRef.current
    lassoAdditiveRef.current = false
    ex.lassoEnd()
    if (onLasso) {
      // Same contract as the React explorer: selection only changes if the
      // consumer calls `select` (the preview is rolled back first).
      ex.setSelection(lassoBaseRef.current)
      onLasso(paths, {
        select: (next) => {
          ex.setSelection(next)
          notifySelection()
        },
        additive
      })
      notifySelection()
      return
    }
    // Default: the core already applied replace (or additive union).
    notifySelection()
  }, [notifySelection, onLasso])

  useEffect(() => subscribeToDecorations(() => setGitBadges(isGitDecorationsVisible())), [])

  // Drags continue outside the canvas (mouse leaves the panel): the native
  // core keeps receiving the pointer and the release always ends both drags.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!lassoDragRef.current) return
      const canvas = canvasRef.current
      const ex = explorerRef.current
      if (!canvas || !ex) return
      const rect = canvas.getBoundingClientRect()
      ex.lassoUpdate(e.clientX - rect.left, e.clientY - rect.top)
    }
    const onUp = (): void => {
      textDragRef.current = false
      if (lassoDragRef.current) finishLasso()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [finishLasso])

  // Explorer tabs are rooted at their own folder and ignore workspace changes.
  useEffect(() => {
    setRoot(rootOverride ?? getWorkspaceRoot())
  }, [rootOverride])

  // Follow workspace changes triggered from other panels (Welcome, menu…).
  useEffect(() => {
    if (rootOverride) return
    const onWorkspaceChanged = (event: Event): void => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      setRoot(path ?? getWorkspaceRoot())
    }
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [rootOverride])

  // Header title: the opened folder name (Scrakk behavior), not "Explorador".
  useEffect(() => {
    setTitle(root ? baseNameOf(root) : t('explorer.explorador'))
  }, [root, setTitle])

  const reopen = useCallback(async (): Promise<void> => {
    if (!root) return
    await explorerRef.current?.open(root)
  }, [root])

  const newFile = useCallback(async (): Promise<void> => {
    await createNewFile(root ?? undefined)
    await reopen()
  }, [root, reopen])

  const newFolder = useCallback(async (): Promise<void> => {
    await createNewFolder(root ?? undefined)
    await reopen()
  }, [root, reopen])

  const expandAllFolders = useCallback(async (): Promise<void> => {
    if (!root) return
    await explorerRef.current?.expandAllProgressive(root, isSkipFilesOnExpandAll())
  }, [root])

  const collapseAllFolders = useCallback((): void => {
    explorerRef.current?.collapseAll()
  }, [])

  const copyPath = useCallback(async (path: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Sin permiso de clipboard: se ignora.
    }
  }, [])

  const deleteRow = useCallback(
    async (row: { path: string; name: string }): Promise<void> => {
      if (!window.confirm(`Eliminar "${row.name}"?`)) return
      await api.fs.deleteFile(row.path)
      await reopen()
    },
    [reopen]
  )

  const startRename = useCallback(
    (row: { path: string; name: string }): void => {
      explorerRef.current?.beginRename(row.path, row.name)
      canvasRef.current?.focus()
    },
    []
  )

  // Inline rename geometry, derived from the core (row index + level + scroll).
  const editInputRect = useCallback((): {
    x: number
    y: number
    w: number
    h: number
  } | null => {
    const ex = explorerRef.current
    if (!ex || !ex.editingPath()) return null
    const idx = ex.editRow()
    if (idx < 0) return null
    const row = ex.rows(idx, 1)[0]
    if (!row) return null
    const rowY = LIST_PAD_Y + idx * ROW_HEIGHT - ex.scrollY()
    const left = 4 + BASE_PAD + row.level * INDENT + 16 + 2 + 16 + 6 - 2
    return {
      x: left,
      y: rowY + ROW_HEIGHT / 2 - 10,
      w: Math.max(60, sizeRef.current.w - left - 8),
      h: 20
    }
  }, [])

  // Host-side glyph measurement: x -> caret byte offset (the core owns the
  // actual caret/selection state and all editing semantics).
  const caretFromX = useCallback((clientX: number): number => {
    const ex = explorerRef.current
    const canvas = canvasRef.current
    const box = editInputRect()
    if (!ex || !canvas || !box) return 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return ex.caret()
    ctx.font = '12px Inter, system-ui, sans-serif'
    const value = ex.editValue()
    const textLeft = box.x + 6 - ex.editScroll()
    const x = clientX - canvas.getBoundingClientRect().left
    const encoder = new TextEncoder()
    let best = 0
    let bestDist = Math.abs(x - textLeft)
    let u16 = 0
    let bytes = 0
    for (const ch of value) {
      u16 += ch.length
      bytes += encoder.encode(ch).length
      const w = ctx.measureText(value.slice(0, u16)).width
      const dist = Math.abs(x - (textLeft + w))
      if (dist < bestDist) {
        bestDist = dist
        best = bytes
      }
    }
    return best
  }, [editInputRect])

  const commitRename = useCallback(async (): Promise<void> => {
    const ex = explorerRef.current
    if (!ex) return
    const oldPath = ex.editingPath()
    if (!oldPath) return
    const value = ex.editValue().trim()
    const name = oldPath.split(/[/\\]/).pop() ?? ''
    ex.cancelRename()
    if (!value || value === name) return
    const parent = oldPath.replace(/[\\/][^\\/]+$/, '')
    await api.fs.moveFile(oldPath, `${parent}/${value}`)
    await reopen()
  }, [reopen])

  const menuItems = ((): ContextMenuItem[] => {
    if (!menu) return []
    const row = menu.row
    if (!row) {
      return [
        { label: t('explorer.actualizar'), onClick: () => void reopen() },
        { label: t('explorer.nuevo.archivo'), onClick: () => void newFile() },
        { label: t('explorer.nueva.carpeta'), onClick: () => void newFolder() },
        ...(root
          ? [
              {
                label: t('explorer.copiar.ruta.raiz'),
                separatorBefore: true,
                onClick: () => void copyPath(root)
              },
              {
                label: t('explorer.abrir.en.explorador'),
                onClick: () => void api.fs.openInFolder(root)
              }
            ]
          : [])
      ]
    }
    const items: ContextMenuItem[] = []
    if (row.isDir) {
      items.push(
        {
          label: t('explorer.nuevo.archivo'),
          onClick: () => void (async () => {
            await createNewFile(row.path)
            await reopen()
          })()
        },
        {
          label: t('explorer.nueva.carpeta'),
          onClick: () => void (async () => {
            await createNewFolder(row.path)
            await reopen()
          })()
        }
      )
    } else {
      items.push({
        label: t('explorer.abrir'),
        onClick: () => openFileInEditor(row.path, row.name)
      })
    }
    items.push(
      {
        label: t('explorer.renombrar'),
        separatorBefore: true,
        onClick: () => startRename(row)
      },
      { label: t('explorer.eliminar'), danger: true, onClick: () => void deleteRow(row) },
      {
        label: t('explorer.mostrar.en.explorador'),
        separatorBefore: true,
        onClick: () => void api.fs.openInFolder(row.path)
      },
      { label: t('explorer.copiar.ruta'), onClick: () => void copyPath(row.path) }
    )
    return items
  })()

  // Original explorer header actions (same ids/icons as Scrakk).
  useEffect(() => {
    setActions(() => (
      <>
        <HeaderActionButton
          id="explorer.new-file"
          label={t('explorer.nuevo.archivo')}
          icon="new-file"
          size="sm"
          shape="rounded"
          onClick={() => void newFile()}
        />
        <HeaderActionButton
          id="explorer.new-folder"
          label={t('explorer.nueva.carpeta')}
          icon="new-folder"
          size="sm"
          shape="rounded"
          onClick={() => void newFolder()}
        />
        <HeaderActionButton
          id="explorer.git-badges"
          label={
            gitBadges ? t('explorer.git.ocultar.estados') : t('explorer.git.mostrar.estados')
          }
          icon="source-control"
          size="sm"
          shape="rounded"
          variant={gitBadges ? 'accent' : 'neutral'}
          onClick={() => setGitDecorationsVisible(!gitBadges)}
        />
        <HeaderActionButton
          id="explorer.expand-all"
          label={t('explorer.expandir.todas.las.carpetas')}
          icon="expand-all"
          size="sm"
          shape="rounded"
          onClick={() => void expandAllFolders()}
        />
        <HeaderActionButton
          id="explorer.collapse-all"
          label={t('explorer.colapsar.todas.las.carpetas')}
          icon="collapse-all"
          size="sm"
          shape="rounded"
          onClick={collapseAllFolders}
        />
        <HeaderActionButton
          id="explorer.refresh"
          label={t('explorer.actualizar.explorador')}
          icon="refresh"
          size="sm"
          shape="rounded"
          onClick={() => void reopen()}
        />
      </>
    ))
    return () => setActions(null)
  }, [gitBadges, newFile, newFolder, reopen, setActions])

  // File icon themes (Material, extensions) are provided by the same registry
  // the original React explorer uses. Invalidate the raster cache when they
  // change so canvas icons follow the active theme.
  useEffect(
    () =>
      subscribeToFileIcons(() => {
        iconCache.current.clear()
      }),
    []
  )

  useEffect(
    () =>
      subscribeToProductIcons(() => {
        chevronCache.current.clear()
      }),
    []
  )

  useEffect(() => {
    let alive = true
    let raf = 0

    const draw = (): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const { w, h } = sizeRef.current
      if (w === 0 || h === 0) return

      // One computed-style read per frame (the vars are theme-driven).
      const rootStyle = getComputedStyle(document.documentElement)
      const read = (name: string, fallback: string): string =>
        rootStyle.getPropertyValue(name).trim() || fallback
      const bg = read('--color-bg', '#000')
      const hoverBg = read('--color-hover', '#1a1a1a')
      const accent = read('--color-accent', '#fb923c')
      const text = read('--color-text', '#fff')
      const muted = read('--color-text-muted', '#7a7a7a')
      const border = read('--color-border', '#262626')
      // Theme-driven item radius (default = Scrakk's --radius-sm: 8px).
      const radiusRaw = Number.parseFloat(read('--radius-sm', '8px'))
      const itemRadius = Number.isFinite(radiusRaw) ? radiusRaw : 8

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      const explorer = explorerRef.current
      const sy = explorer?.scrollY() ?? 0
      // Virtualization: only read the rows inside the viewport (+ buffer).
      const first = Math.max(0, Math.floor(sy / ROW_HEIGHT) - VIRTUAL_BUFFER)
      const count = Math.ceil(h / ROW_HEIGHT) + VIRTUAL_BUFFER * 2 + 1
      const all = explorer?.rows(first, count) ?? []
      const editPath = explorer?.editingPath() ?? ''

      ctx.font = '12px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'

      for (let j = 0; j < all.length; j++) {
        const i = first + j
        const row = all[j]
        const rowY = LIST_PAD_Y + i * ROW_HEIGHT - sy
        if (rowY + ROW_HEIGHT < 0 || rowY > h) continue

        if (row.selected) {
          // Scrakk: accent 14%, 20% on hover. Contiguous selected rows merge
          // (the core reports the merge bits) so there is no inner radius.
          const corners = {
            tl: row.mergeTop ? 0 : itemRadius,
            tr: row.mergeTop ? 0 : itemRadius,
            br: row.mergeBottom ? 0 : itemRadius,
            bl: row.mergeBottom ? 0 : itemRadius
          }
          ctx.fillStyle = row.hovered ? accent + '33' : accent + '24'
          roundRectCorners(ctx, 4, rowY, w - 8, ROW_HEIGHT, corners)
          ctx.fill()
        } else if (row.hovered) {
          ctx.fillStyle = hoverBg
          roundRect(ctx, 4, rowY, w - 8, ROW_HEIGHT, itemRadius)
          ctx.fill()
        }

        for (let l = 0; l < row.level; l++) {
          const gx = 4 + BASE_PAD + l * INDENT + 7
          ctx.fillStyle = border
          ctx.globalAlpha = 0.5
          ctx.fillRect(gx, rowY, 1, ROW_HEIGHT)
          ctx.globalAlpha = 1
        }

        let cx = 4 + BASE_PAD + row.level * INDENT
        const midY = rowY + ROW_HEIGHT / 2

        if (row.isDir) {
          drawChevron(ctx, chevronCache.current, row.expanded, cx, midY, muted)
        }
        cx += 16 + 2

        // File icon theme (Material / extension-provided), same registry the
        // React explorer uses. Falls back to the drawn folder/file glyph.
        const iconKey = `${row.path}|${row.isDir}|${row.expanded}`
        let entry = iconCache.current.get(iconKey)
        if (!entry) {
          const url = getFileIconUrl(row.name, {
            path: row.path,
            isDirectory: row.isDir,
            isExpanded: row.expanded
          })
          const img = url ? new Image() : null
          if (img && url) img.src = url
          entry = { img, url }
          iconCache.current.set(iconKey, entry)
        }
        if (entry.img && entry.img.complete && entry.img.naturalWidth > 0) {
          ctx.drawImage(entry.img, cx, midY - 8, 16, 16)
        } else if (row.isDir) {
          ctx.fillStyle = accent
          roundRect(ctx, cx, midY - 6, 14, 11, 2)
          ctx.fill()
          ctx.fillStyle = bg
          ctx.fillRect(cx + 1, midY - 5, 12, 2)
        } else {
          ctx.fillStyle = muted
          roundRect(ctx, cx + 1, midY - 7, 11, 14, 2)
          ctx.fill()
        }
        cx += 16 + 6

        if (explorer && editPath && editPath === row.path) {
          // Native inline rename: the C++ core owns value/caret/selection;
          // here we only paint them (selection highlight + blinking caret).
          const inputX = cx - 2
          const inputW = Math.max(60, w - inputX - 8)
          const surfaceRaised = read('--color-surface-raised', '#161616')
          ctx.fillStyle = surfaceRaised
          roundRect(ctx, inputX, midY - 10, inputW, 20, 4)
          ctx.fill()

          const value = explorer.editValue()
          const bounds = textBoundaries(value)
          const caretU16 = u16AtByte(bounds, explorer.caret())
          const anchorU16 = u16AtByte(bounds, explorer.anchor())
          const caretX = ctx.measureText(value.slice(0, caretU16)).width
          // The core decides the horizontal text offset (long names).
          explorer.followCaret(caretX, inputW)
          const textX = inputX + 6 - explorer.editScroll()

          ctx.save()
          ctx.beginPath()
          ctx.rect(inputX + 2, midY - 10, inputW - 4, 20)
          ctx.clip()

          if (caretU16 !== anchorU16) {
            const a = Math.min(caretU16, anchorU16)
            const b = Math.max(caretU16, anchorU16)
            const x1 = textX + ctx.measureText(value.slice(0, a)).width
            const x2 = textX + ctx.measureText(value.slice(0, b)).width
            ctx.fillStyle = accent + '66'
            ctx.fillRect(x1, midY - 7, Math.max(1, x2 - x1), 14)
          }

          ctx.fillStyle = text
          ctx.fillText(value, textX, midY)

          if (explorer.caretVisible()) {
            ctx.fillStyle = text
            ctx.fillRect(textX + caretX, midY - 7, 1, 14)
          }
          ctx.restore()
        } else {
          ctx.fillStyle = text
          ctx.fillText(row.name, cx, midY)
        }
      }

      // Native lasso rectangle: geometry, hit-test and auto-scroll all come
      // from the C++ core; the host only paints it.
      if (explorer?.lassoActive()) {
        const box = explorer.lassoRect()
        if (box.w > 0 || box.h > 0) {
          ctx.fillStyle = accent + '14'
          ctx.strokeStyle = accent + '80'
          ctx.lineWidth = 1
          roundRect(
            ctx,
            box.x + 0.5,
            box.y + 0.5,
            Math.max(0, box.w - 1),
            Math.max(0, box.h - 1),
            3
          )
          ctx.fill()
          ctx.stroke()
        }
      }

      // No outer border: the panel card already draws it. The scrollbar is
      // the browser's native one on the scroller element.
    }

    let lastContent = -1
    let lastFrame = performance.now()
    const loop = (now: number): void => {
      if (!alive) return
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
      lastFrame = now
      explorerRef.current?.tick(dt)

      // Native lasso auto-scroll: the core computes the delta; the host just
      // moves the native scroller (its scroll event re-runs the hit-test).
      const scrollDelta = explorerRef.current?.takeLassoScroll() ?? 0
      if (scrollDelta !== 0 && scrollerRef.current) {
        scrollerRef.current.scrollTop += scrollDelta
      }

      // Content height is written straight to the DOM: expanding a folder must
      // not re-render React (that used to flash the whole panel).
      const ch = explorerRef.current?.contentHeight() ?? 0
      if (ch !== lastContent && spacerRef.current) {
        lastContent = ch
        spacerRef.current.style.height = `${ch}px`
      }
      draw()
      raf = requestAnimationFrame(loop)
    }

    const onResize = (): void => {
      const scroller = scrollerRef.current
      const canvas = canvasRef.current
      if (!scroller || !canvas) return
      const w = scroller.clientWidth
      const h = scroller.clientHeight
      if (w === 0 || h === 0) return
      const dpr = window.devicePixelRatio || 1
      // Resizing the bitmap clears it; only do it when the size really changed
      // and repaint immediately so the cleared frame is never presented.
      if (w === sizeRef.current.w && h === sizeRef.current.h) return
      sizeRef.current = { w, h }
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      explorerRef.current?.setViewport(w, h)
      draw()
    }

    const ro = new ResizeObserver(onResize)
    if (scrollerRef.current) ro.observe(scrollerRef.current)

    void (async () => {
      try {
        // One WASM instance per panel (independent tree/hover/scroll).
        const explorer = await createNativeExplorer()
        explorerRef.current = explorer
        if (root) await explorer.open(root)
        onResize()
        raf = requestAnimationFrame(loop)
      } catch (err) {
        console.error('[explorer] native load failed', err)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      explorerRef.current?.close()
      explorerRef.current = null
    }
  }, [root])

  const rowAt = (
    clientY: number
  ): { path: string; name: string; isDir: boolean; index: number; level: number } | null => {
    const wrap = wrapRef.current
    if (!wrap) return null
    const rect = wrap.getBoundingClientRect()
    const explorer = explorerRef.current
    if (!explorer) return null
    const local = clientY - rect.top + explorer.scrollY() - LIST_PAD_Y
    const idx = Math.floor(local / ROW_HEIGHT)
    if (local < 0 || idx < 0 || idx >= explorer.rowCount()) return null
    const row = explorer.rows(idx, 1)[0]
    if (!row) return null
    return {
      path: row.path,
      name: row.name,
      isDir: row.isDir,
      index: idx,
      level: row.level
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      {!root ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Abre una carpeta para explorar.</p>
          <button
            type="button"
            className={styles.emptyBtn}
            onClick={() => {
              void (async () => {
                await openFolderViaDialog()
                setRoot(getWorkspaceRoot())
              })()
            }}
          >
            Abrir carpeta
          </button>
        </div>
      ) : null}
      {error ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No se pudo cargar el explorer nativo.</p>
          <pre className={styles.errorText}>{error}</pre>
        </div>
      ) : null}
      <div
        ref={scrollerRef}
        className={styles.scroller}
        onScroll={(e) => explorerRef.current?.setScroll(e.currentTarget.scrollTop)}
      >
      <div ref={spacerRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        onKeyDown={(e) => {
          const ex = explorerRef.current
          if (!ex || !ex.editingPath()) return
          const mod = e.ctrlKey || e.metaKey
          if (e.key === 'Escape') {
            e.preventDefault()
            ex.cancelRename()
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            void commitRename()
            return
          }
          if (mod && e.key.toLowerCase() === 'a') {
            e.preventDefault()
            ex.selectAll()
            return
          }
          if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
            e.preventDefault()
            const text = ex.selectedText()
            if (!text) return
            void navigator.clipboard.writeText(text).catch(() => {})
            if (e.key.toLowerCase() === 'x') ex.editBackspace()
            return
          }
          if (mod && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            void navigator.clipboard
              .readText()
              .then((text) => {
                if (text) ex.editInsert(text)
              })
              .catch(() => {})
            return
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            ex.editMove(-1, e.shiftKey)
            return
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            ex.editMove(1, e.shiftKey)
            return
          }
          if (e.key === 'Home') {
            e.preventDefault()
            ex.editHome(e.shiftKey)
            return
          }
          if (e.key === 'End') {
            e.preventDefault()
            ex.editEnd(e.shiftKey)
            return
          }
          if (e.key === 'Backspace') {
            e.preventDefault()
            ex.editBackspace()
            return
          }
          if (e.key === 'Delete') {
            e.preventDefault()
            ex.editDelete()
            return
          }
          if (e.key.length === 1 && !mod && !e.altKey) {
            e.preventDefault()
            ex.editInsert(e.key)
          }
        }}
        onMouseMove={(e) => {
          const canvas = canvasRef.current
          const ex = explorerRef.current
          if (!canvas || !ex) return
          // The window listener drives the native lasso (also outside canvas).
          if (lassoDragRef.current) {
            canvas.style.cursor = 'default'
            return
          }
          const rect = canvas.getBoundingClientRect()
          const box = editInputRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          const overInput =
            box !== null && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h

          // While selecting text the selection follows the pointer (native
          // drag: anchor stays put, caret moves).
          if (textDragRef.current && ex.editingPath()) {
            ex.setCaret(caretFromX(e.clientX), true)
            canvas.style.cursor = 'text'
            return
          }

          // The 4px lateral margins are tree background (same as Scrakk rows).
          const inRow = x >= 4 && x <= sizeRef.current.w - 4
          canvas.style.cursor =
            overInput ? 'text' : inRow && rowAt(e.clientY) ? 'pointer' : 'default'
          if (inRow) ex.hover(x, y)
          else ex.hover(-1, -1)
        }}
        onMouseLeave={() => {
          if (canvasRef.current) canvasRef.current.style.cursor = 'default'
          explorerRef.current?.hover(-1, -1)
        }}
        draggable
        onDragStart={(e) => {
          // Text selection inside the inline rename must not start a drag.
          if (explorerRef.current?.editingPath()) {
            e.preventDefault()
            return
          }
          const canvas = canvasRef.current
          const x = canvas ? e.clientX - canvas.getBoundingClientRect().left : 0
          const row =
            x >= 4 && x <= sizeRef.current.w - 4 ? rowAt(e.clientY) : null
          if (!row) {
            e.preventDefault()
            return
          }
          lastDragRef.current = Date.now()
          setResourceDragData(e.dataTransfer, [
            {
              kind: row.isDir ? 'folder' : 'file',
              path: row.path,
              name: row.name
            }
          ])
          e.dataTransfer.effectAllowed = 'copyMove'

          // Custom drag image: just the item, not the whole canvas.
          const ghost = document.createElement('div')
          ghost.textContent = row.name
          ghost.style.cssText =
            'position:fixed;top:-1000px;left:-1000px;height:22px;display:flex;' +
            'align-items:center;padding:0 10px;border-radius:6px;' +
            'background:var(--color-surface-raised);color:var(--color-text);' +
            'border:1px solid color-mix(in srgb,var(--color-border) 60%,transparent);' +
            'font:12px Inter,system-ui,sans-serif;white-space:nowrap;pointer-events:none;'
          document.body.appendChild(ghost)
          e.dataTransfer.setDragImage(ghost, 8, 11)
          setTimeout(() => ghost.remove(), 0)
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          const ex = explorerRef.current
          const canvas = canvasRef.current
          if (!ex || !canvas) return
          const rect = canvas.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top

          if (ex.editingPath()) {
            const box = editInputRect()
            if (box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
              // Native caret placement; shift-click keeps the anchor (selection).
              ex.setCaret(caretFromX(e.clientX), e.shiftKey)
              textDragRef.current = true
              canvas.focus()
              e.preventDefault()
              return
            }
            // Rename input "blur": commit before the click reaches the row.
            void commitRename()
          }

          canvas.focus()

          // Rows start at x=4 (Scrakk's lateral margin); the margins and the
          // empty area below the list are tree background → native lasso.
          const onRow = !!rowAt(e.clientY) && x >= 4 && x <= sizeRef.current.w - 4
          if (onRow) return

          e.preventDefault()
          const additive = e.ctrlKey || e.metaKey
          lassoBaseRef.current = additive ? ex.selection() : []
          lassoAdditiveRef.current = additive
          ex.lassoBegin(x, y, additive)
          lassoDragRef.current = true
          if (!additive) notifySelection()
        }}
        onMouseUp={() => {
          textDragRef.current = false
        }}
        onDoubleClick={(e) => {
          const box = editInputRect()
          const canvas = canvasRef.current
          if (!box || !canvas) return
          const rect = canvas.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
            explorerRef.current?.selectAll()
          }
        }}
        onClick={(e) => {
          const now = Date.now()
          if (now - lastDragRef.current < 300) return
          // Releasing the lasso over a row must not click it.
          if (now - lassoClickRef.current < 300) return
          const ex = explorerRef.current
          const canvas = canvasRef.current
          if (!ex || !canvas || ex.editingPath()) return
          const rect = canvas.getBoundingClientRect()
          const x = e.clientX - rect.left
          if (x < 4 || x > sizeRef.current.w - 4) return
          const row = rowAt(e.clientY)
          if (!row) return
          // Ctrl/Cmd = toggle, Shift = range (native core applies the mode).
          const mode = e.ctrlKey || e.metaKey ? 1 : e.shiftKey ? 2 : 0
          void (async () => {
            if (row.isDir) await ex.setDir(row.path)
            const action = await ex.clickIndex(row.index, mode)
            if (action === 2) onOpenFile?.(row.path, row.name)
            notifySelection()
          })()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          const canvas = canvasRef.current
          const x = canvas ? e.clientX - canvas.getBoundingClientRect().left : 0
          const insideRow = x >= 4 && x <= sizeRef.current.w - 4
          const row = insideRow ? rowAt(e.clientY) : null
          setMenu({ x: e.clientX, y: e.clientY, row })
        }}
      />
      </div>
      </div>
      {menu ? (
        <ContextMenu
          items={menuItems}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Byte <-> UTF-16 boundary table. The native core stores caret/selection as
 * UTF-8 byte offsets; canvas text slicing needs UTF-16 indices.
 */
function textBoundaries(value: string): Array<{ u16: number; byte: number }> {
  const encoder = new TextEncoder()
  const out = [{ u16: 0, byte: 0 }]
  let u16 = 0
  let byte = 0
  for (const ch of value) {
    u16 += ch.length
    byte += encoder.encode(ch).length
    out.push({ u16, byte })
  }
  return out
}

function u16AtByte(
  bounds: Array<{ u16: number; byte: number }>,
  byte: number
): number {
  for (const b of bounds) if (b.byte >= byte) return b.u16
  return bounds[bounds.length - 1]?.u16 ?? 0
}

const CHEVRON_PATHS: Record<string, string> = {
  'chevron-down': 'm4.75 9.75 6.19 6.19a1.5 1.5 0 0 0 2.12 0l6.19-6.19',
  'chevron-right': 'm9.75 4.75 6.19 6.19a1.5 1.5 0 0 1 0 2.12l-6.19 6.19'
}

function chevronDataUri(id: string, color: string): string {
  const path = CHEVRON_PATHS[id] ?? CHEVRON_PATHS['chevron-right']
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${path}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function drawFallbackChevron(
  ctx: CanvasRenderingContext2D,
  expanded: boolean,
  x: number,
  midY: number,
  color: string
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.beginPath()
  if (expanded) {
    ctx.moveTo(x + 4, midY - 2)
    ctx.lineTo(x + 8, midY + 2)
    ctx.lineTo(x + 12, midY - 2)
  } else {
    ctx.moveTo(x + 6, midY - 4)
    ctx.lineTo(x + 10, midY)
    ctx.lineTo(x + 6, midY + 4)
  }
  ctx.stroke()
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  cache: Map<string, HTMLImageElement>,
  expanded: boolean,
  x: number,
  midY: number,
  color: string
): void {
  const id = expanded ? 'chevron-down' : 'chevron-right'
  const resolved = resolveProductIcon(id)

  if (resolved?.kind === 'font') {
    ctx.fillStyle = color
    ctx.font = `12px "${resolved.family}"`
    ctx.fillText(resolved.char, x, midY + 1)
    return
  }

  // Builtin (ProIcons default) or any component theme: rasterize the glyph.
  const componentId = resolved?.kind === 'component' ? resolved.componentId : id
  const key = `${componentId}|${color}`
  let img = cache.get(key)
  if (!img) {
    img = new Image()
    img.src = chevronDataUri(componentId, color)
    cache.set(key, img)
  }
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, midY - 6, 12, 12)
  } else {
    drawFallbackChevron(ctx, expanded, x, midY, color)
  }
}

/** Rounded rect with independent corner radii (merged selection rows). */
function roundRectCorners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: { tl: number; tr: number; br: number; bl: number }
): void {
  const max = Math.min(w / 2, h / 2)
  const tl = Math.min(r.tl, max)
  const tr = Math.min(r.tr, max)
  const br = Math.min(r.br, max)
  const bl = Math.min(r.bl, max)
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
