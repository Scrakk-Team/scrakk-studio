// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de búsqueda — grep real sobre el workspace vía `fs:search-in-files`
 * (nativo kolargrep si está disponible, fallback TS si no) y búsqueda de
 * ARCHIVOS/CARPETAS por nombre vía `fs:search-files`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISEÑO (mismo lenguaje que Problems / Git / Notas / chat)
 *
 * · Segmented `Contenido | Archivos` para elegir QUÉ se busca.
 * · Barra de filtros con chips (Mayúsculas, Regex, Tipo) y campos Incluir /
 *   Excluir — varios filtros combinables, todos client-side salvo el include
 *   del grep, que el backend ya entiende.
 * · Resultados agrupados por archivo (contenido) o por carpeta (archivos),
 *   colapsables y con contador, como el panel de Problemas.
 * · Acciones en el header (actualizar / limpiar), filas con acción en hover y
 *   estados vacíos con icono. Hover directo, sin transiciones.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { SegmentedTabs } from '@ui'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import { openFileInEditor } from '@features/editor'
import { setWorkspaceRoot } from '@features/explorer'
import { notify } from '@services/notifications'
import type { GrepMatch, SearchResult } from '@shared/fs'
import styles from './SearchPanel.module.css'

import { t } from '@core/i18n'
import { api } from '@services/api'
const ROOT_KEY = 'scrakk-studio:root-path'
const DEBOUNCE_MS = 250
const MAX_RESULTS = 100

type Mode = 'content' | 'files'
type FileType = 'all' | 'files' | 'folders'

function useWorkspaceRoot(): string | null {
  const [root, setRoot] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const onChange = (event: Event): void => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (path) setRoot(path)
    }
    window.addEventListener('workspace-changed', onChange)
    return () => window.removeEventListener('workspace-changed', onChange)
  }, [])
  return root
}

/**
 * Parte la línea en segmentos, marcando los que cubren un `span`.
 *
 * Los spans del server son rangos de **bytes** sobre el contenido de la línea,
 * así que se cortan sobre los bytes y se decodifican: cortar por caracteres
 * fallaría con acentos o emoji.
 */
function segmentsOf(
  content: string,
  spans?: Array<[number, number]>
): Array<{ text: string; hit: boolean }> {
  if (!spans || spans.length === 0) return [{ text: content, hit: false }]
  const bytes = new TextEncoder().encode(content)
  const decoder = new TextDecoder()
  const segments: Array<{ text: string; hit: boolean }> = []
  let cursor = 0
  for (const [rawStart, rawEnd] of spans) {
    const start = Math.max(cursor, Math.min(rawStart, bytes.length))
    const end = Math.max(start, Math.min(rawEnd, bytes.length))
    if (start > cursor) segments.push({ text: decoder.decode(bytes.subarray(cursor, start)), hit: false })
    if (end > start) segments.push({ text: decoder.decode(bytes.subarray(start, end)), hit: true })
    cursor = end
  }
  if (cursor < bytes.length) segments.push({ text: decoder.decode(bytes.subarray(cursor)), hit: false })
  return segments
}

function baseNameOf(path: string): string {
  const clean = path.replace(/[/\\]+$/, '')
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1) || clean
}

function dirNameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

/** Rutas del backend de archivos son relativas al root; el editor quiere absolutas. */
function absoluteOf(root: string, rel: string): string {
  const base = root.replace(/\/+$/, '')
  return `${base}/${rel.replace(/^\/+/, '')}`
}

/** `*.ts, *.tsx` → expresiones insensibles a mayúsculas con `*` comodín. */
function globList(pattern: string): RegExp[] {
  return pattern
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((glob) => {
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      return new RegExp(`^${escaped}$`, 'i')
    })
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

export function SearchPanel(): JSX.Element {
  const { setTitle, setActions } = usePanelTitle()
  const root = useWorkspaceRoot()

  const [mode, setMode] = useState<Mode>('content')
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [include, setInclude] = useState('')
  const [exclude, setExclude] = useState('')
  const [fileType, setFileType] = useState<FileType>('all')
  const [showFilters, setShowFilters] = useState(false)

  const [matches, setMatches] = useState<GrepMatch[]>([])
  const [files, setFiles] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [refreshTick, setRefreshTick] = useState(0)
  const genRef = useRef(0)

  useEffect(() => {
    setTitle(t('layout.panel.search'))
  }, [setTitle])

  useEffect(() => {
    const q = query.trim()
    if (!q || !root) {
      setMatches([])
      setFiles([])
      setSearching(false)
      setError(null)
      return
    }
    const gen = ++genRef.current
    setSearching(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (mode === 'content') {
            const res = await api.fs.searchInFiles(
              root,
              q,
              include.trim() || undefined,
              caseSensitive,
              MAX_RESULTS,
              regex
            )
            if (genRef.current !== gen) return
            if (!res.success) {
              setMatches([])
              setError(res.error ?? t('layout.fallo.la.busqueda'))
              return
            }
            const excluded = exclude.trim()
              ? exclude.trim().toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
              : []
            setMatches(
              (res.matches ?? []).filter(
                (match) => !excluded.some((pattern) => match.file.toLowerCase().includes(pattern))
              )
            )
            setFiles([])
            setError(null)
          } else {
            const res = await api.fs.searchFiles(root, q, exclude.trim() || undefined, MAX_RESULTS)
            if (genRef.current !== gen) return
            if (!res.success) {
              setFiles([])
              setError(res.error ?? t('layout.fallo.la.busqueda'))
              return
            }
            const included = include.trim() ? globList(include) : []
            setFiles(
              (res.results ?? []).filter((result) => {
                if (fileType === 'files' && result.isDirectory) return false
                if (fileType === 'folders' && !result.isDirectory) return false
                return (
                  included.length === 0 ||
                  matchesAny(result.name, included) ||
                  matchesAny(result.path, included)
                )
              })
            )
            setMatches([])
            setError(null)
          }
        } catch (e) {
          if (genRef.current !== gen) return
          setMatches([])
          setFiles([])
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          if (genRef.current === gen) setSearching(false)
        }
      })()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, root, mode, caseSensitive, regex, include, exclude, fileType, refreshTick])

  const refresh = useCallback((): void => {
    setRefreshTick((value) => value + 1)
  }, [])

  const clearAll = useCallback((): void => {
    setQuery('')
    setInclude('')
    setExclude('')
    setCaseSensitive(false)
    setRegex(false)
    setFileType('all')
  }, [])

  const activeFilters =
    (include.trim() ? 1 : 0) +
    (exclude.trim() ? 1 : 0) +
    (caseSensitive ? 1 : 0) +
    (regex ? 1 : 0) +
    (fileType !== 'all' ? 1 : 0)

  const toggleGroup = useCallback((key: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const copyLine = useCallback((match: GrepMatch): void => {
    const text = `${baseNameOf(match.file)}:${match.line}  ${match.content}`
    const clip = navigator.clipboard
    if (!clip?.writeText) {
      notify({ title: t('git.no.se.pudo.copiar'), severity: 'error' })
      return
    }
    void clip.writeText(text).then(
      () => notify({ title: t('layout.busqueda.linea.copiada'), severity: 'success' }),
      () => notify({ title: t('git.no.se.pudo.copiar'), severity: 'error' })
    )
  }, [])

  useEffect(() => {
    setActions(() => (
      <>
        <HeaderActionButton
          id="search.refresh"
          label={t('git.actualizar')}
          icon="refresh"
          size="sm"
          onClick={refresh}
        />
        <HeaderActionButton
          id="search.clear"
          label={t('layout.busqueda.limpiar')}
          icon="close"
          size="sm"
          onClick={clearAll}
        />
      </>
    ))
    return () => setActions(null)
  }, [setActions, refresh, clearAll])

  /** Agrupación de coincidencias por archivo. */
  const contentGroups = useMemo(() => {
    const map = new Map<string, GrepMatch[]>()
    for (const match of matches) {
      const list = map.get(match.file) ?? []
      list.push(match)
      map.set(match.file, list)
    }
    return [...map.entries()].map(([file, rows]) => ({ file, rows }))
  }, [matches])

  /** Agrupación de resultados de archivos por carpeta contenedora. */
  const fileGroups = useMemo(() => {
    const map = new Map<string, SearchResult[]>()
    for (const result of files) {
      const dir = dirNameOf(result.path)
      const list = map.get(dir) ?? []
      list.push(result)
      map.set(dir, list)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dir, rows]) => ({ dir, rows }))
  }, [files])

  const total = mode === 'content' ? matches.length : files.length
  const searched = query.trim().length > 0

  return (
    <div className={styles.search}>
      {/* Buscador con icono (como el panel de Búsqueda clásico). */}
      <div className={styles.box}>
        <ProductIcon
          id={mode === 'content' ? 'search' : 'file'}
          size={14}
          className={styles.boxIcon}
          aria-hidden="true"
        />
        <input
          className={styles.boxInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            mode === 'content'
              ? t('layout.buscar.en.archivos')
              : t('layout.busqueda.nombre.de.archivo')
          }
          aria-label={t('layout.buscar.en.archivos-2')}
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className={styles.clearBtn}
            aria-label={t('layout.busqueda.limpiar')}
            title={t('layout.busqueda.limpiar')}
            onClick={() => setQuery('')}
          >
            <ProductIcon id="close" size={12} />
          </button>
        ) : null}
      </div>

      {/* Modo + filtros (Notas / Git). */}
      <div className={styles.controls}>
        <SegmentedTabs
          items={[
            { id: 'content', label: t('layout.busqueda.contenido') },
            { id: 'files', label: t('layout.busqueda.archivos') }
          ]}
          activeId={mode}
          onChange={(id) => setMode(id === 'files' ? 'files' : 'content')}
          ariaLabel={t('layout.busqueda.modo')}
        />
        <button
          type="button"
          className={[styles.filterToggle, activeFilters > 0 ? styles.filterToggleOn : null]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <ProductIcon id="settings-gear" size={13} />
          <span>{t('layout.busqueda.filtros')}</span>
          {activeFilters > 0 ? <span className={styles.filterCount}>{activeFilters}</span> : null}
        </button>
      </div>

      {showFilters ? (
        <div className={styles.filters}>
          <div className={styles.chips}>
            <button
              type="button"
              className={[styles.chip, caseSensitive ? styles.chipOn : null].filter(Boolean).join(' ')}
              aria-pressed={caseSensitive}
              title={t('layout.busqueda.mayusculas')}
              onClick={() => setCaseSensitive((value) => !value)}
            >
              Aa
            </button>
            <button
              type="button"
              className={[styles.chip, regex ? styles.chipOn : null].filter(Boolean).join(' ')}
              aria-pressed={regex}
              title={t('layout.busqueda.regex')}
              disabled={mode !== 'content'}
              onClick={() => setRegex((value) => !value)}
            >
              .*
            </button>
            {mode === 'files' ? (
              <SegmentedTabs
                items={[
                  { id: 'all', label: t('layout.busqueda.todos') },
                  { id: 'files', label: t('layout.busqueda.solo.archivos') },
                  { id: 'folders', label: t('layout.busqueda.solo.carpetas') }
                ]}
                activeId={fileType}
                onChange={(id) => setFileType(id as FileType)}
                ariaLabel={t('layout.busqueda.tipo')}
              />
            ) : null}
          </div>
          <div className={styles.filterFields}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('layout.busqueda.incluir')}</span>
              <input
                className={styles.fieldInput}
                value={include}
                placeholder={mode === 'content' ? '*.ts, src/**' : '*.tsx'}
                aria-label={t('layout.busqueda.incluir')}
                spellCheck={false}
                onChange={(event) => setInclude(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('layout.busqueda.excluir')}</span>
              <input
                className={styles.fieldInput}
                value={exclude}
                placeholder={t('layout.busqueda.excluir.placeholder')}
                aria-label={t('layout.busqueda.excluir')}
                spellCheck={false}
                onChange={(event) => setExclude(event.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {!root ? (
        <div className={styles.placeholder}>
          <ProductIcon id="folder" size={26} className={styles.placeholderIcon} aria-hidden="true" />
          <p className={styles.empty}>{t('layout.abre.una.carpeta.para.buscar')}</p>
        </div>
      ) : !searched ? (
        <div className={styles.placeholder}>
          <ProductIcon id="search" size={26} className={styles.placeholderIcon} aria-hidden="true" />
          <p className={styles.empty}>
            {mode === 'content'
              ? t('layout.escribe.para.buscar.en.el')
              : t('layout.busqueda.escribe.nombre')}
          </p>
        </div>
      ) : error ? (
        <div className={styles.placeholder}>
          <ProductIcon id="alert" size={26} className={styles.placeholderIcon} aria-hidden="true" />
          <p className={styles.empty}>{error}</p>
        </div>
      ) : searching && total === 0 ? (
        <p className={styles.empty}>{t('layout.buscando')}</p>
      ) : total === 0 ? (
        <div className={styles.placeholder}>
          <ProductIcon id="search" size={26} className={styles.placeholderIcon} aria-hidden="true" />
          <p className={styles.empty}>
            {t('layout.sin.resultados.para')}{query.trim()}”
          </p>
          {activeFilters > 0 ? (
            <button type="button" className={styles.linkBtn} onClick={clearAll}>
              {t('layout.busqueda.limpiar.filtros')}
            </button>
          ) : null}
        </div>
      ) : mode === 'content' ? (
        <div className={styles.results} role="list" aria-label={t('layout.resultados.de.busqueda')}>
          {contentGroups.map((group) => {
            const key = `file:${group.file}`
            const isCollapsed = collapsed.has(key)
            return (
              <section key={key} className={styles.group} role="listitem">
                <button
                  type="button"
                  className={styles.groupHeader}
                  aria-expanded={!isCollapsed}
                  title={group.file}
                  onClick={() => toggleGroup(key)}
                >
                  <ProductIcon
                    id={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size={12}
                    className={styles.arrow}
                  />
                  <ProductIcon id="file-text" size={13} className={styles.groupIcon} />
                  <span className={styles.groupTitle}>{baseNameOf(group.file)}</span>
                  <span className={styles.groupSubtitle}>{dirNameOf(group.file)}</span>
                  <span className={styles.count}>{group.rows.length}</span>
                </button>
                {isCollapsed
                  ? null
                  : group.rows.map((match, index) => (
                      <div
                        key={`${match.file}:${match.line}:${index}`}
                        className={styles.hit}
                        role="button"
                        tabIndex={0}
                        title={`${match.file}:${match.line}`}
                        onClick={() => openFileInEditor(match.file, baseNameOf(match.file))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            openFileInEditor(match.file, baseNameOf(match.file))
                          }
                        }}
                      >
                        <span className={styles.hitLine}>{match.line}</span>
                        <span className={styles.hitPreview}>
                          {segmentsOf(match.content, match.spans).map((segment, j) =>
                            segment.hit ? (
                              <mark key={j} className={styles.hitMark}>{segment.text}</mark>
                            ) : (
                              <span key={j}>{segment.text}</span>
                            )
                          )}
                        </span>
                        <button
                          type="button"
                          className={styles.rowBtn}
                          aria-label={t('layout.busqueda.copiar.linea')}
                          title={t('layout.busqueda.copiar.linea')}
                          onClick={(event) => {
                            event.stopPropagation()
                            copyLine(match)
                          }}
                        >
                          <ProductIcon id="copy" size={12} />
                        </button>
                      </div>
                    ))}
              </section>
            )
          })}
        </div>
      ) : (
        <div className={styles.results} role="list" aria-label={t('layout.resultados.de.busqueda')}>
          {fileGroups.map((group) => (
            <section key={`dir:${group.dir}`} className={styles.group} role="listitem">
              <div className={styles.groupHeader} title={group.dir}>
                <ProductIcon id="folder" size={13} className={styles.groupIcon} />
                <span className={styles.groupTitle}>{group.dir || '.'}</span>
                <span className={styles.count}>{group.rows.length}</span>
              </div>
              {group.rows.map((result) => {
                const absolute = root ? absoluteOf(root, result.path) : result.path
                return (
                  <div
                    key={result.path}
                    className={styles.fileRow}
                    role="button"
                    tabIndex={0}
                    title={absolute}
                    onClick={() => {
                      if (result.isDirectory) setWorkspaceRoot(absolute)
                      else openFileInEditor(absolute, result.name)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      if (result.isDirectory) setWorkspaceRoot(absolute)
                      else openFileInEditor(absolute, result.name)
                    }}
                  >
                    <ProductIcon
                      id={result.isDirectory ? 'folder' : 'file'}
                      size={14}
                      className={styles.fileIcon}
                    />
                    <span className={styles.fileName}>{result.name}</span>
                    {result.isDirectory ? (
                      <span className={styles.typeBadge}>{t('layout.busqueda.carpeta')}</span>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.footerCount}>{total}</span>
        <span>
          {mode === 'content' ? t('layout.busqueda.coincidencias') : t('layout.busqueda.elementos')}
        </span>
        {activeFilters > 0 ? (
          <>
            <span className={styles.footerDot}>·</span>
            <span className={styles.footerHint}>
              {t('layout.busqueda.con.filtros')} {activeFilters}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
