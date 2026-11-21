// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import {
  useEffect,
  useState,
  type ComponentType,
  type JSX,
  type ReactNode
} from 'react'
import { readEncoded } from '@services/encodings'
import { notify } from '@services/notifications'
import { ProductIcon } from '@services/productIcons/components'
import { msg } from '@core/i18n'
import {
  effectiveMode,
  fileHandlerRegistry,
  registerBuiltinFileHandlers,
  subscribeToPreferredModes,
  type FileHandler,
  type FileHandlerViewProps,
  type FileViewMode,
  virtualIdOf
} from '@features/fileHandlers'
import styles from './EditorPanel.module.css'

/** Lo que el dispatcher resuelve para un path: qué visor va y con qué datos. */
export interface FileViewResolution {
  /** Hay un visor montado para este path (si no, el editor). */
  viewing: boolean
  /** El handler ganador (`null` = sin handler → editor). */
  handler: FileHandler | null
  /** Componente del visor (recién cargado por import dinámico). */
  View: ComponentType<FileHandlerViewProps> | null
  /** Texto del archivo para los formatos editables en modo visor. */
  content: string | undefined
  /** Toolbar con las `actions[]` del handler (o `null`). */
  toolbar: JSX.Element | null
  /** Nodo listo para render: el visor, o `null` si toca el editor. */
  node: ReactNode
}

/**
 * Resuelve el handler de `path` contra el registry y carga su VISOR cuando el
 * modo efectivo es `view`.
 *
 * Es la mitad "visor" del área de archivos, en un hook para que la use TODO
 * punto de montaje real (`FileTabView`, que es lo que renderiza cada tab de
 * archivo) y no sólo el panel `editor`.
 *
 * Nada hardcodeado: qué visor va, si se puede alternar y qué botones tiene lo
 * decide el `fileHandlerRegistry` (el handler declara su `match` y su `mode`).
 */
export function useFileViewDispatcher(path: string | null): FileViewResolution {
  // Los handlers built-in se registran al montar (idempotente).
  useEffect(() => {
    registerBuiltinFileHandlers()
  }, [])

  const [handler, setHandler] = useState<FileHandler | null>(null)
  const [mode, setMode] = useState<FileViewMode>('text')
  const [View, setView] = useState<ComponentType<FileHandlerViewProps> | null>(null)
  const [content, setContent] = useState<string | undefined>(undefined)

  // Handler ganador + modo efectivo. Reacciona al registro de handlers y a la
  // preferencia por archivo (el toggle visor ⇄ editor).
  useEffect(() => {
    let alive = true
    const resolve = (): void => {
      const next = fileHandlerRegistry.resolve(path ?? '')
      setHandler(next)
      setMode(effectiveMode(next, path ?? ''))
      // Un archivo sin visor que resulte ser BINARIO (no texto) cae al visor
      // comodín en vez de abrir el editor con basura. Los handlers own:view
      // (imagen/pdf/...) no se tocan.
      if (next?.mode === 'text' && path && !virtualIdOf(path)) {
        void readEncoded(path).then((res) => {
          if (!alive) return
          if (res.detected?.binary) {
            const generic = fileHandlerRegistry.list().find((h) => h.binaryFallback)
            if (generic) {
              setHandler(generic)
              setMode('view')
            }
          }
        })
      }
    }
    resolve()
    const unsubHandlers = fileHandlerRegistry.subscribe(resolve)
    const unsubModes = subscribeToPreferredModes(resolve)
    return () => {
      alive = false
      unsubHandlers()
      unsubModes()
    }
  }, [path])

  // Carga del visor por import dinámico + el texto si el formato es editable.
  useEffect(() => {
    if (mode !== 'view' || !handler?.load || !path) {
      setView(null)
      setContent(undefined)
      return
    }
    let alive = true
    setView(null)
    void handler.load().then((module) => {
      if (alive) setView(() => module.default)
    })
    // Los formatos editables (markdown, svg) además reciben su texto.
    if (handler.mode !== 'view') {
      void readEncoded(path).then((res) => {
        if (alive && res.success && typeof res.text === 'string') setContent(res.text)
      })
    }
    return () => {
      alive = false
    }
  }, [path, mode, handler])

  const viewing = mode === 'view' && View !== null

  const toolbar =
    viewing && handler?.actions?.length && path ? (
      <div className={styles.viewerBar} role="toolbar">
        {handler.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={styles.viewerAction}
            title={msg(action.label)}
            onClick={() => void action.run({ path, content, notify })}
          >
            {action.icon ? <ProductIcon id={action.icon} size={13} aria-hidden="true" /> : null}
            <span>{msg(action.label)}</span>
          </button>
        ))}
      </div>
    ) : null

  return {
    viewing,
    handler,
    View,
    content,
    toolbar,
    node:
      viewing && path && View ? (
        <div className={styles.viewer}>
          {toolbar}
          <View path={path} content={content} />
        </div>
      ) : null
  }
}