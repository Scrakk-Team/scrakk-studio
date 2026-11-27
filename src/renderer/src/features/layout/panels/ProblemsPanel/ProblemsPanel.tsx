// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Problemas — la lista de diagnósticos del IDE (panel del layout).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALEN (dos canales, un solo store)
 *
 *   1. **Language servers**: `publishDiagnostics` → main → `lsp:on-diagnostics`.
 *   2. **Extensiones**: `vscode.languages.createDiagnosticCollection(...).set()`
 *      → host → `diagnostics/change`.
 *
 * El store (`@services/lsp/diagnosticsStore`) guarda cada fuente por separado
 * y aquí se lee AGREGADO: un error de un linter y uno de `tsc` sobre la misma
 * línea son dos problemas, no uno que pisa al otro. Cada fila muestra su
 * ORIGEN (`source` del diagnóstico, o el nombre del server/extensión) porque
 * "por qué me marca esto" es la primera pregunta del usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN SUBRAYA EN EL EDITOR
 *
 * No este panel: el subrayado lo pinta el motor con el canal de decoraciones
 * (`services/lsp/decorations.ts` → `@services/decorations` → Innerta). El panel
 * LISTA, el editor MUESTRA; los dos leen el MISMO store, así que no pueden
 * discrepar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISEÑO
 *
 * Lenguaje de los otros paneles: scoreboard de severidades como la barra de
 * Git (clicable = filtro), buscador con icono como Búsqueda, segmented para
 * agrupar como Notas, y filas agrupadas con acción en hover como Git/chat.
 * Todo en tipografía calmada, sin transiciones en el hover y con números
 * tabulares.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { subscribeToProductIcons } from '@services/productIcons'
import { SegmentedTabs } from '@ui'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import { getEditorFiles, openFileInEditor } from '@features/editor'
import { revealInnertaPosition } from '@features/editor/engines/innerta/hostBridge'
import {
  getAllStoredDiagnostics,
  severityOf,
  subscribeToDiagnostics,
  type StoredFileDiagnostics
} from '@services/lsp'
import { notify } from '@services/notifications'
import type { LspDiagnostic } from '@shared/lsp'
import styles from './ProblemsPanel.module.css'

import { t } from '@core/i18n'
/** Severidades del LSP, con su icono y su color (1 = error … 4 = hint). */
const SEVERITIES = [
  { id: 1, get label() { return t('layout.errores') }, icon: 'close', color: 'var(--color-danger, #f14c4c)' },
  { id: 2, get label() { return t('layout.advertencias') }, icon: 'alert', color: 'var(--color-warning, #cca700)' },
  { id: 3, get label() { return t('layout.informacion') }, icon: 'info', color: 'var(--color-info, #3794ff)' },
  { id: 4, get label() { return t('layout.sugerencias') }, icon: 'info', color: 'var(--color-text-muted)' }
] as const

function severityMeta(severity: number): (typeof SEVERITIES)[number] {
  return SEVERITIES.find((entry) => entry.id === severity) ?? SEVERITIES[3]
}

/** Último segmento de una ruta (el nombre del archivo). */
function baseName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || path
}

/** Carpeta que contiene la ruta ('' si está en la raíz). */
function dirName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

/**
 * Abre el archivo y lleva el cursor al problema.
 *
 * El engine del editor tarda en montar (se carga el wasm por archivo), así que
 * `revealInnertaPosition` falla en los primeros milisegundos: se reintenta
 * acotado en vez de perder el salto (que es justo para lo que el usuario
 * clickeó).
 */
function openProblemAt(path: string, line: number, column: number): void {
  const { activePath, openFiles } = getEditorFiles()
  if (activePath !== path || !openFiles.some((file) => file.path === path)) {
    openFileInEditor(path, baseName(path))
  }

  const deadline = Date.now() + 2000
  const attempt = (): void => {
    if (revealInnertaPosition(path, line, column)) return
    if (Date.now() >= deadline) return
    window.setTimeout(attempt, 60)
  }
  attempt()
}

interface ProblemRow {
  diagnostic: LspDiagnostic
  origin: string
  path: string
}

interface ProblemSection {
  key: string
  title: string
  subtitle?: string
  icon?: string
  color?: string
  filePath?: string
  rows: ProblemRow[]
}

export function ProblemsPanel(): JSX.Element {
  const { setActions } = usePanelTitle()
  const [groups, setGroups] = useState<StoredFileDiagnostics[]>(() => getAllStoredDiagnostics())
  const [enabled, setEnabled] = useState<Set<number>>(() => new Set([1, 2, 3, 4]))
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [groupBy, setGroupBy] = useState<'file' | 'severity'>('file')
  const [iconVersion, setIconVersion] = useState(0)
  useEffect(() => subscribeToProductIcons(() => setIconVersion((v) => v + 1)), [])
  /** El foco del input no se pierde al refrescar (los diagnósticos llegan en vivo). */
  const queryRef = useRef(query)
  queryRef.current = query

  const refresh = useCallback((): void => setGroups(getAllStoredDiagnostics()), [])

  useEffect(() => {
    refresh()
    return subscribeToDiagnostics(refresh)
  }, [refresh])

  const toggleSeverity = useCallback((id: number): void => {
    setEnabled((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearFilters = useCallback((): void => {
    setEnabled(new Set([1, 2, 3, 4]))
    setQuery('')
  }, [])

  /** Conteo por severidad sobre TODO lo conocido (para el scoreboard). */
  const counts = useMemo(() => {
    const out = new Map<number, number>()
    for (const group of groups) {
      for (const diagnostic of group.diagnostics) {
        const severity = severityOf(diagnostic)
        out.set(severity, (out.get(severity) ?? 0) + 1)
      }
    }
    return out
  }, [groups])

  /**
   * Filtro aplicado: severidades activas + texto (mensaje, origen o archivo).
   * Cada fila sale con SU origen: el diagnóstico puede no traer `source` (una
   * extensión que no lo setea) y ahí el origen útil es el nombre de la fuente
   * que lo publicó, que sí lo conocemos.
   */
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return groups
      .map((group) => {
        const rows: Array<{ diagnostic: LspDiagnostic; origin: string }> = []
        for (const source of group.sources) {
          for (const diagnostic of source.diagnostics) {
            const origin = diagnostic.source ?? source.name
            if (!enabled.has(severityOf(diagnostic))) continue
            if (
              needle.length > 0 &&
              !`${diagnostic.message} ${origin} ${diagnostic.code ?? ''} ${group.path}`
                .toLowerCase()
                .includes(needle)
            ) {
              continue
            }
            rows.push({ diagnostic, origin })
          }
        }
        return { path: group.path, rows }
      })
      .filter((group) => group.rows.length > 0)
  }, [groups, enabled, query])

  const totalVisible = filtered.reduce((total, group) => total + group.rows.length, 0)
  const anyFilter = enabled.size < SEVERITIES.length || query.trim().length > 0

  /** Agrupación: por archivo (default) o por severidad, con el mismo conjunto de filas. */
  const sections = useMemo<ProblemSection[]>(() => {
    if (groupBy === 'file') {
      const errorsOf = (group: (typeof filtered)[number]): number =>
        group.rows.filter((row) => severityOf(row.diagnostic) === 1).length
      return [...filtered]
        .sort((a, b) => errorsOf(b) - errorsOf(a) || baseName(a.path).localeCompare(baseName(b.path)))
        .map((group) => ({
          key: `file:${group.path}`,
          title: baseName(group.path),
          subtitle: dirName(group.path),
          filePath: group.path,
          rows: group.rows.map((row) => ({ ...row, path: group.path }))
        }))
    }
    const rows = filtered.flatMap((group) =>
      group.rows.map((row) => ({ ...row, path: group.path }))
    )
    return SEVERITIES.map((severity) => ({
      key: `sev:${severity.id}`,
      title: severity.label,
      icon: severity.icon,
      color: severity.color,
      rows: rows.filter((row) => severityOf(row.diagnostic) === severity.id)
    })).filter((section) => section.rows.length > 0)
  }, [filtered, groupBy])

  const allKeys = useMemo(() => sections.map((section) => section.key), [sections])
  const allCollapsed = allKeys.length > 0 && allKeys.every((key) => collapsed.has(key))

  const toggleGroup = useCallback((key: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAll = useCallback((): void => {
    setCollapsed(allCollapsed ? new Set() : new Set(allKeys))
  }, [allCollapsed, allKeys])

  const copyProblem = useCallback((row: ProblemRow): void => {
    const text = `${row.diagnostic.message}${row.origin ? ` (${row.origin})` : ''} — ${row.path}:${
      row.diagnostic.range.start.line + 1
    }:${row.diagnostic.range.start.character + 1}`
    const clip = navigator.clipboard
    if (!clip?.writeText) {
      notify({ title: t('git.no.se.pudo.copiar'), severity: 'error' })
      return
    }
    void clip.writeText(text).then(
      () => notify({ title: t('layout.problemas.copiado'), severity: 'success' }),
      () => notify({ title: t('git.no.se.pudo.copiar'), severity: 'error' })
    )
  }, [])

  // Header actions: mismo patrón que Git/Chat (botones arrastrables del título).
  useEffect(() => {
    setActions(() => (
      <>
        <HeaderActionButton
          id="problems.refresh"
          label={t('git.actualizar')}
          icon="refresh"
          size="sm"
          onClick={refresh}
        />
        <HeaderActionButton
          id="problems.toggle-collapse"
          label={allCollapsed ? t('layout.problemas.expandir') : t('layout.problemas.contraer')}
          icon={allCollapsed ? 'expand-all' : 'collapse-all'}
          size="sm"
          onClick={toggleAll}
        />
      </>
    ))
    return () => setActions(null)
  }, [setActions, refresh, allCollapsed, toggleAll, iconVersion])

  return (
    <div className={styles.problems}>
      {/* Scoreboard: cliquear una severidad la filtra (como los chips de Git). */}
      <div className={styles.scoreboard} role="group" aria-label={t('layout.problemas.filtrar.por.tipo')}>
        {SEVERITIES.map((severity) => {
          const count = counts.get(severity.id) ?? 0
          const active = enabled.has(severity.id)
          return (
            <button
              key={severity.id}
              type="button"
              className={[styles.chip, active ? styles.chipOn : null].filter(Boolean).join(' ')}
              aria-pressed={active}
              title={active
                ? `${t('layout.problemas.ocultar')} ${severity.label.toLowerCase()}`
                : `${t('layout.problemas.mostrar')} ${severity.label.toLowerCase()}`}
              onClick={() => toggleSeverity(severity.id)}
            >
              <span className={styles.chipIcon} style={{ color: severity.color }}>
                <ProductIcon id={severity.icon} size={12} />
              </span>
              <span className={styles.chipLabel}>{severity.label}</span>
              <span className={styles.chipCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Buscador + agrupación (Búsqueda + Notas). */}
      <div className={styles.controls}>
        <div className={styles.box}>
          <ProductIcon id="search" size={14} className={styles.boxIcon} aria-hidden="true" />
          <input
            className={styles.boxInput}
            value={query}
            placeholder={t('layout.filtrar.problemas')}
            aria-label={t('layout.filtrar.problemas-2')}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className={styles.clearBtn}
              aria-label={t('layout.problemas.limpiar.filtros')}
              title={t('layout.problemas.limpiar.filtros')}
              onClick={clearFilters}
            >
              <ProductIcon id="close" size={12} />
            </button>
          ) : null}
        </div>
        <SegmentedTabs
          items={[
            { id: 'file', label: t('layout.problemas.por.archivo') },
            { id: 'severity', label: t('layout.problemas.por.severidad') }
          ]}
          activeId={groupBy}
          onChange={(id) => setGroupBy(id === 'severity' ? 'severity' : 'file')}
          ariaLabel={t('layout.problemas.agrupar')}
        />
      </div>

      {sections.length === 0 ? (
        <div className={styles.placeholder}>
          <ProductIcon
            id={anyFilter ? 'search' : 'check'}
            size={26}
            className={styles.placeholderIcon}
            aria-hidden="true"
          />
          <p className={styles.empty}>
            {anyFilter
              ? t('layout.ningun.problema.coincide.con.el')
              : t('layout.no.hay.problemas.en.el')}
          </p>
          {anyFilter ? (
            <button type="button" className={styles.linkBtn} onClick={clearFilters}>
              {t('layout.problemas.limpiar.filtros')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.list} role="list">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key)
            const active = section.filePath
              ? getEditorFiles().activePath === section.filePath
              : false
            return (
              <section key={section.key} className={styles.group} role="listitem">
                <button
                  type="button"
                  className={[styles.groupHeader, active ? styles.groupActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-expanded={!isCollapsed}
                  title={section.filePath ?? section.title}
                  onClick={() => toggleGroup(section.key)}
                >
                  <ProductIcon
                    id={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size={12}
                    className={styles.arrow}
                  />
                  {section.icon ? (
                    <span className={styles.groupIcon} style={{ color: section.color }}>
                      <ProductIcon id={section.icon} size={12} />
                    </span>
                  ) : null}
                  <span className={styles.groupTitle}>{section.title}</span>
                  {section.subtitle ? (
                    <span className={styles.groupSubtitle}>{section.subtitle}</span>
                  ) : null}
                  <span className={styles.count}>{section.rows.length}</span>
                </button>

                {isCollapsed
                  ? null
                  : section.rows.map((row, index) => {
                      const meta = severityMeta(severityOf(row.diagnostic))
                      const position = `${row.diagnostic.range.start.line + 1}:${
                        row.diagnostic.range.start.character + 1
                      }`
                      return (
                        <div
                          key={`${row.path}:${index}:${row.diagnostic.range.start.line}:${row.diagnostic.range.start.character}`}
                          className={styles.row}
                          role="button"
                          tabIndex={0}
                          title={`${row.diagnostic.message}${row.origin ? `\n${t('layout.problemas.origen')}: ${row.origin}` : ''}`}
                          onClick={() =>
                            openProblemAt(
                              row.path,
                              row.diagnostic.range.start.line,
                              row.diagnostic.range.start.character
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              openProblemAt(
                                row.path,
                                row.diagnostic.range.start.line,
                                row.diagnostic.range.start.character
                              )
                            }
                          }}
                        >
                          <span className={styles.rowIcon} style={{ color: meta.color }}>
                            <ProductIcon id={meta.icon} size={12} />
                          </span>
                          <span className={styles.rowBody}>
                            <span className={styles.message}>{row.diagnostic.message}</span>
                            <span className={styles.meta}>
                              <span className={styles.origin}>{row.origin}</span>
                              {row.diagnostic.code !== undefined ? (
                                <span className={styles.code}>{String(row.diagnostic.code)}</span>
                              ) : null}
                              <span className={styles.position}>{position}</span>
                            </span>
                          </span>
                          <button
                            type="button"
                            className={styles.rowBtn}
                            aria-label={t('layout.problemas.copiar')}
                            title={t('layout.problemas.copiar')}
                            onClick={(event) => {
                              event.stopPropagation()
                              copyProblem(row)
                            }}
                          >
                            <ProductIcon id="copy" size={12} />
                          </button>
                        </div>
                      )
                    })}
              </section>
            )
          })}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.footerCount}>{totalVisible}</span>
        <span>{t('layout.problemas.total')}</span>
        <span className={styles.footerDot}>·</span>
        <span className={styles.footerHint}>{t('layout.problemas.pie')}</span>
      </div>
    </div>
  )
}
