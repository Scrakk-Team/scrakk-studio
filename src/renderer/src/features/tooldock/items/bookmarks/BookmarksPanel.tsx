// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Bookmarks — panel del ToolDock.
 *
 * Dos ámbitos (segmented en el header del panel, SOLO acá):
 *  - `global`: marcadores de todos los archivos DEL PROYECTO (no del proyecto
 *    anterior ni de archivos sueltos que ya no existen en el workspace).
 *  - `file`: marcadores del archivo abierto en el editor.
 *
 * La store (@services/bookmarks) guarda por path y persiste en storage; este
 * panel filtra lo que muestra. Click en una línea abre el archivo y lleva el
 * cursor ahí (reintentos acotados: el engine tarda en montar la sesión).
 */

import { useEffect, useMemo, useState, type JSX } from 'react'
import { IconButton } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { getEditorFiles, openFileInEditor, subscribeToEditorFiles } from '@features/editor'
import { revealInnertaPosition } from '@features/editor/engines/innerta/hostBridge'
import { usePanelTitleOptional } from '@features/layout'
import { getWorkspaceRoot } from '@features/explorer/hooks/useWorkspaceState'
import {
  getAllBookmarks,
  toggleBookmark,
  subscribeToBookmarks
} from '@services/bookmarks'
import type { ToolDockPanelProps } from '../../types'
import styles from './BookmarksPanel.module.css'

import { t } from '@core/i18n'

type Scope = 'global' | 'file'

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

/** Paths canónicos para comparar (barras + mayúsculas de Windows). */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isWithinRoot(path: string, root: string | null): boolean {
  if (!root) return false
  const p = normalizePath(path)
  const r = normalizePath(root)
  return p === r || p.startsWith(`${r}/`)
}

function useWorkspaceRoot(): string | null {
  const [root, setRoot] = useState<string | null>(() => getWorkspaceRoot())
  useEffect(() => {
    const onChange = (): void => setRoot(getWorkspaceRoot())
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])
  return root
}

/** Abre el archivo y salta a la línea (el engine tarda en tener la sesión lista). */
function openAtLine(path: string, line: number): void {
  const { activePath, openFiles } = getEditorFiles()
  if (activePath !== path || !openFiles.some((file) => file.path === path)) {
    openFileInEditor(path, baseName(path))
  }
  const deadline = Date.now() + 2000
  const attempt = (): void => {
    if (revealInnertaPosition(path, line, 0)) return
    if (Date.now() >= deadline) return
    window.setTimeout(attempt, 60)
  }
  attempt()
}

export default function BookmarksPanel({ currentFile }: ToolDockPanelProps): JSX.Element {
  const [scope, setScope] = useState<Scope>('global')
  const [data, setData] = useState<Record<string, number[]>>(() => getAllBookmarks())
  const [files, setFiles] = useState(() => getEditorFiles())
  const workspaceRoot = useWorkspaceRoot()
  const panelHeader = usePanelTitleOptional()
  const setHeaderActions = panelHeader?.setActions ?? null

  useEffect(() => {
    const sync = (): void => setData(getAllBookmarks())
    sync()
    return subscribeToBookmarks(sync)
  }, [])

  useEffect(() => subscribeToEditorFiles(() => setFiles(getEditorFiles())), [])

  // El toggle de ámbito vive en el header del PanelFrame del ToolDock. Sólo lo
  // declara este panel: outline/timeline no lo ven (se limpia al desmontar).
  // ICONOS (proicons), sin texto: el header del dock es angosto y los labels
  // se cortaban. `globe` = global, `file` = archivo abierto.
  useEffect(() => {
    if (!setHeaderActions) return undefined
    setHeaderActions(() => (
      <div
        className={styles.scopeToggle}
        role="group"
        aria-label={t('features.ambito.de.marcadores')}
      >
        <button
          type="button"
          className={[
            styles.scopeBtn,
            scope === 'global' ? styles.scopeActive : null
          ].filter(Boolean).join(' ')}
          aria-label={t('layout.ambito.global')}
          aria-pressed={scope === 'global'}
          title={t('layout.ambito.global')}
          onClick={() => setScope('global')}
        >
          <ProductIcon id="globe" size={16} />
        </button>
        <button
          type="button"
          className={[
            styles.scopeBtn,
            scope === 'file' ? styles.scopeActive : null
          ].filter(Boolean).join(' ')}
          aria-label={t('features.ambito.este.archivo')}
          aria-pressed={scope === 'file'}
          title={t('features.ambito.este.archivo')}
          onClick={() => setScope('file')}
        >
          <ProductIcon id="file" size={16} />
        </button>
      </div>
    ))
    return () => setHeaderActions(null)
  }, [setHeaderActions, scope])

  const paths = useMemo(() => {
    const currentPath = currentFile?.path
    const openPaths = new Set(files.openFiles.map((file) => file.path))
    return Object.keys(data)
      .filter((path) => (data[path]?.length ?? 0) > 0)
      .filter((path) => {
        if (scope === 'file') return path === currentPath
        if (workspaceRoot) return isWithinRoot(path, workspaceRoot)
        // Sin proyecto abierto: evitar monumentos de projects anteriores.
        return openPaths.has(path)
      })
      .sort((a, b) => a.localeCompare(b))
  }, [data, scope, currentFile, files, workspaceRoot])

  if (paths.length === 0) {
    return (
      <div className={styles.empty}>
        {t('features.sin.marcadores.click.derecho.sobre')}
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {paths.map((path) => (
        <div key={path} className={styles.file}>
          <div className={styles.fileRow}>
            <ProductIcon id="file" size={12} />
            <span className={styles.fileName}>{baseName(path)}</span>
          </div>
          <div className={styles.lines}>
            {data[path].map((line) => (
              <div key={line} className={styles.line}>
                <button
                  type="button"
                  className={styles.lineBtn}
                  onClick={() => openAtLine(path, line)}
                  title={`${path}:${line + 1}`}
                >
                  <ProductIcon id="bookmark" size={11} />
                  <span className={styles.lineNumber}>:{line + 1}</span>
                </button>
                <IconButton
                  size="sm"
                  shape="rounded"
                  label={`Quitar marcador de ${baseName(path)}:${line + 1}`}
                  onClick={() => toggleBookmark(path, line)}
                >
                  <ProductIcon id="close" size={11} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
