// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cuerpo del modal de `read_file`.
 *
 * La tool devuelve un JSON con el contenido + metadata (líneas, fin de línea,
 * BOM, warnings). El contenido NO se vuelca como texto: se monta una sesión
 * de Innerta Engine AISLADA (mismo patrón que la card de archivo compartido del
 * panel Social), en **sólo lectura** — se lee, se selecciona y se copia, pero
 * no se edita. La metadata va en filas arriba.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import type { EditorEngine } from '@features/editor/engine'
import {
  ToolModalCode,
  ToolModalEmpty,
  ToolModalMeta,
  ToolModalSection,
  type ToolModalContext
} from '@services/ai/tool-shell'
import { api } from '@services/api'
import { t } from '@core/i18n'
import { resolvePath } from '../../utils'
import styles from './ReadFileModal.module.css'

interface ReadFilePayload {
  path?: string
  content?: string
  total_lines?: number
  original_line_ending?: string
  had_bom?: boolean
  normalization_warnings?: string[]
}

function parsePayload(result?: string): ReadFilePayload | null {
  if (!result) return null
  try {
    const parsed = JSON.parse(result) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as ReadFilePayload
  } catch {
    return null
  }
}

export function ReadFileModal({ args, result, status }: ToolModalContext): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)

  const running = status === 'running' || status === 'streaming' || status === 'pending'
  const path = typeof args.path === 'string' ? args.path : ''
  const payload = parsePayload(result)
  const targetPath = path || (typeof payload?.path === 'string' ? payload.path : '')
  const workspaceRoot = (() => {
    try {
      return localStorage.getItem('scrakk-studio:root-path') ?? ''
    } catch {
      return ''
    }
  })()
  const fullPath = targetPath ? resolvePath(targetPath, workspaceRoot) : ''
  const startLine =
    typeof args.start_line === 'number' && Number.isFinite(args.start_line)
      ? Math.max(1, Math.floor(args.start_line))
      : undefined
  const endLine =
    typeof args.end_line === 'number' && Number.isFinite(args.end_line)
      ? Math.max(1, Math.floor(args.end_line))
      : undefined

  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)

  // El contenido NO viaja con la card: se lee recién ahora, al abrir el modal.
  // Así el archivo no queda en el estado de React ni en la persistencia.
  useEffect(() => {
    if (!fullPath) {
      setFileContent(null)
      setLoading(false)
      setReadError(null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setReadError(null)
    void api.fs
      .readFile(fullPath)
      .then((response) => {
        if (cancelled) return
        if (!response.success || response.content === undefined) {
          setFileContent(null)
          setReadError(response.error ?? t('chat.tool.sin.salida'))
          return
        }
        let text = response.content
        if (startLine !== undefined || endLine !== undefined) {
          const lines = text.split('\n')
          const from = Math.max(0, (startLine ?? 1) - 1)
          const to = Math.min(lines.length, endLine ?? lines.length)
          text = lines.slice(from, Math.max(from, to)).join('\n')
        }
        setFileContent(text)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFileContent(null)
          setReadError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fullPath, startLine, endLine])

  // Sesión de Innerta AISLADA por modal (su WASM + canvas), en sólo lectura.
  // Import DINÁMICO: el motor (y su WASM) no se carga hasta abrir el modal, así
  // el barrel de tools no arrastra el editor.
  useEffect(() => {
    if (fileContent === null) return undefined
    const host = hostRef.current
    if (!host) return undefined

    let cancelled = false
    let engine: EditorEngine | null = null
    let raf = 0

    void import('@features/editor/engine').then(({ createIsolatedEditorEngine }) => {
      if (cancelled) return
      engine = createIsolatedEditorEngine()
      engine.attach(host)
      engine.loadFile(fullPath || 'archivo', fileContent)
      // Sólo lectura: bloquea tipeo, borrado, pegado, cortado y undo/redo.
      engine.setReadOnly?.(true)
      // `loadFile` enfoca el canvas; acá no queremos robarle el foco al chat.
      raf = requestAnimationFrame(() => {
        host.querySelector<HTMLCanvasElement>('canvas')?.blur()
      })
    })

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      engine?.destroy?.()
    }
  }, [fileContent, fullPath])

  if (loading) {
    return <ToolModalEmpty>{t('chat.tool.cargando.contenido')}</ToolModalEmpty>
  }
  if (readError) {
    return (
      <ToolModalSection title={targetPath || undefined}>
        <ToolModalCode>{readError}</ToolModalCode>
      </ToolModalSection>
    )
  }
  if (fileContent === null) {
    if (running && !result) {
      return <ToolModalEmpty>{t('chat.tool.todavia.corriendo')}</ToolModalEmpty>
    }
    return (
      <ToolModalSection title={targetPath || undefined}>
        <ToolModalCode>{result ?? t('chat.tool.sin.salida')}</ToolModalCode>
      </ToolModalSection>
    )
  }

  const warnings = Array.isArray(payload?.normalization_warnings)
    ? payload.normalization_warnings
    : []
  const lines =
    typeof payload?.total_lines === 'number'
      ? payload.total_lines
      : fileContent.split('\n').length

  return (
    <>
      <ToolModalMeta
        items={[
          { label: t('chat.tool.ruta'), value: targetPath },
          { label: t('chat.tool.lineas'), value: String(lines) },
          ...(payload?.original_line_ending
            ? [{ label: t('chat.tool.estado'), value: payload.original_line_ending }]
            : []),
          ...(warnings.length > 0
            ? [{ label: t('chat.tool.detalles'), value: warnings.join(' · ') }]
            : [])
        ]}
      />
      <ToolModalSection title={t('chat.tool.contenido')} grow>
        <div ref={hostRef} className={styles.embed} />
      </ToolModalSection>
    </>
  )
}
