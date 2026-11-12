// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Canal de tokens del host hacia el motor — el ÚNICO dueño.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN DUEÑO ÚNICO
 *
 * El motor tiene UN buffer de tokens (`SetInnertaSemanticTokens`). Si cada
 * fuente empujara por su cuenta, la última en llegar borraría a la otra: el LSP
 * (que se actualiza al guardar/abrir) y la gramática TextMate de una extensión
 * (que se recalcula al tipear) se pisarían en cada cambio.
 *
 * Entonces las fuentes no empujan: PUBLICAN aquí (`setSourceTokens`) y este
 * módulo fusiona por prioridad (`mergeHostTokens`) y publica el resultado.
 * La prioridad ya está definida en el núcleo compartido — el LSP gana sobre la
 * gramática, la gramática sobre el árbol.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FUENTE DE RESALTADO
 *
 * - sin tokens del host → `0`: sólo tree-sitter embebido (el motor decide).
 * - con tokens → `2` (mixto): el motor pinta con sus gramáticas Y encima los
 *   tokens del host donde declaran. Es lo correcto porque el host puede tener
 *   cobertura parcial (el LSP de un lenguaje, la gramática de una extensión) y
 *   el motor no debería apagar lo que sí sabe.
 */

import { encodeHostTokens, mergeHostTokens, type HostToken, type SyntaxSource } from '@shared/syntax'
import { getPersistedHighlightSource } from '@services/storage'
import type { InnertaModule } from './InnertaEngine'

/** Fuentes que publican tokens del lado del host. */
export type HostTokenSource = Extract<SyntaxSource, 'textMate' | 'semanticTokens' | 'treeSitterDynamic'>

interface HostTokenState {
  path: string
  sources: Map<HostTokenSource, HostToken[]>
  /**
   * Tokens por ventana (archivos grandes, modo viewport). Cada entrada mapea
   * índice de ventana de `WINDOW_LINES` líneas → tokens con líneas ABSOLUTAS
   * (el bridge ya las desplazó). Se publican concatenando ventanas vigentes.
   */
  windows: Map<HostTokenSource, Map<number, HostToken[]>>
}

/** Cuántas ventanas se conservan por fuente (los horizontes lejanos se pierden). */
const MAX_WINDOWS = 6

/** Ventana de `refreshDynamicHighlight` para archivos enormes. */
export const TOKEN_WINDOW_LINES = 8000

function sourceTokensOf(state: HostTokenState, source: HostTokenSource): HostToken[] {
  const wins = state.windows.get(source)
  if (wins && wins.size > 0) {
    const out: HostToken[] = []
    for (const win of wins.values()) out.push(...win)
    out.sort((a, b) => a.line - b.line || a.startChar - b.startChar || a.length - b.length)
    return out
  }
  return state.sources.get(source) ?? []
}

function sourceKeyUnion(state: HostTokenState): HostTokenSource[] {
  // Orden de publicación histórico: primero las del `sources` (flat) en el
  // orden de inserción, después las que sólo tienen ventanas. mergeHostTokens
  // decide prioridades, así que el orden sólo rompe empates.
  const keys: HostTokenSource[] = [...state.sources.keys()]
  for (const source of state.windows.keys()) {
    if (!keys.includes(source)) keys.push(source)
  }
  return keys
}

const states = new WeakMap<InnertaModule, HostTokenState>()

function stateOf(mod: InnertaModule, path: string): HostTokenState {
  const existing = states.get(mod)
  if (existing && existing.path === path) return existing
  const fresh: HostTokenState = { path, sources: new Map(), windows: new Map() }
  states.set(mod, fresh)
  return fresh
}

/**
 * Fuente de resaltado que se le pide al motor según lo que hay publicado y el
 * ajuste `editor.highlightSource` del usuario:
 *
 *  - `lsp`  → 1 (sólo host): pidió precisión máxima, el motor no pinta con sus
 *             gramáticas. Aplica igual a la gramática de una extensión: es
 *             resaltado del host, no del motor.
 *  - resto  → 2 (mixto) si hay algo publicado: el motor pinta lo que sabe y los
 *             tokens del host pisan donde declaran. Es el default porque el
 *             host puede tener cobertura parcial (LSP de un lenguaje, gramática
 *             de una extensión) y apagar lo que el motor sí sabe no tiene
 *             sentido.
 *  - nada   → 0: sólo tree-sitter embebido.
 */
function resolveHighlightSource(hasTokens: boolean): number {
  if (!hasTokens) return 0
  return getPersistedHighlightSource() === 'lsp' ? 1 : 2
}

/** Diagnóstico de la última publicación (lo usa Ajustes para mostrar qué pinta). */
export interface HighlightDiagnostics {
  /** 0 = sólo motor · 1 = sólo host · 2 = mixto. */
  mode: number
  /** Total de tokens del host publicados. */
  tokens: number
  /** Cuántos aporta cada fuente. */
  sources: Record<HostTokenSource, number>
}

let diagnostics: HighlightDiagnostics = {
  mode: 0,
  tokens: 0,
  sources: { textMate: 0, semanticTokens: 0, treeSitterDynamic: 0 }
}

/** Qué está publicando el host AHORA MISMO (para verificar desde Ajustes). */
export function getHighlightDiagnostics(): HighlightDiagnostics {
  return diagnostics
}

/** Empuja al motor el estado actual (fusionado). */
function publish(mod: InnertaModule, state: HostTokenState): void {
  if (typeof mod.setHostTokens !== 'function') return
  const merged = mergeHostTokens(
    sourceKeyUnion(state).map((source) => ({ source, tokens: sourceTokensOf(state, source) }))
  )
  const source = resolveHighlightSource(merged.length > 0)
  mod.setHostTokens(encodeHostTokens(merged), source)
  diagnostics = {
    mode: source,
    tokens: merged.length,
    sources: {
      textMate: sourceTokensOf(state, 'textMate').length,
      semanticTokens: sourceTokensOf(state, 'semanticTokens').length,
      treeSitterDynamic: sourceTokensOf(state, 'treeSitterDynamic').length
    }
  }
}

/**
 * Cambió el archivo: se tira TODO lo del anterior.
 *
 * Sin esto, los tokens del archivo A quedarían pintados sobre el archivo B
 * hasta que su fuente se recalcule (y el LSP tarda cientos de ms: se vería el
 * archivo nuevo con colores del viejo).
 */
export function resetHostTokens(mod: InnertaModule, path: string): void {
  const state = stateOf(mod, path)
  state.sources.clear()
  state.windows.clear()
  publish(mod, state)
}

/**
 * Publica (o limpia) los tokens de UNA fuente.
 *
 * `null` = esa fuente no tiene nada para decir (no hay gramática, el LSP no
 * respondió): se la saca del merge. No es lo mismo que `[]`, que tampoco
 * aportaría tokens pero perdería el "no volver a preguntar".
 */
export function setSourceTokens(
  mod: InnertaModule,
  path: string,
  source: HostTokenSource,
  tokens: HostToken[] | null
): void {
  const state = stateOf(mod, path)
  if (tokens === null || tokens.length === 0) {
    state.sources.delete(source)
    state.windows.delete(source)
  } else {
    state.sources.set(source, tokens)
    // Un set plano reemplaza la franja completa: las ventanas viejas sobran.
    state.windows.delete(source)
  }
  publish(mod, state)
}

/**
 * Publica los tokens de UNA fuente SOLO para la ventana de líneas que empieza
 * en `startLine` (múltiplo de `TOKEN_WINDOW_LINES`). Los tokens que llegan son
 * RELATIVOS al inicio de la ventana; acá se desplazan a coordenadas absolutas.
 *
 * Sirve para archivos enormes: la extensión tokeniza solo la ventana visible
 * (o la que pidan más adelante) en lugar del documento entero, y las ventanas
 * ya coloreadas no se pierden al pedir la siguiente. Se conservan las últimas
 * MAX_WINDOWS ventanas por fuente; el LRU descarta las más lejanas.
 *
 * `tokens = null` borra la fuente (el LSP murió, la gramática falló).
 */
export function setSourceTokensWindow(
  mod: InnertaModule,
  path: string,
  source: HostTokenSource,
  startLine: number,
  tokens: HostToken[] | null
): void {
  const state = stateOf(mod, path)
  if (tokens === null) {
    state.sources.delete(source)
    state.windows.delete(source)
    publish(mod, state)
    return
  }
  const windowIndex = Math.floor(Math.max(0, startLine) / TOKEN_WINDOW_LINES)
  const wins = state.windows.get(source) ?? new Map<number, HostToken[]>()
  state.windows.set(source, wins)
  // Borra los tokens planos de la fuente: las ventanas mandan.
  state.sources.delete(source)
  wins.delete(windowIndex) // refrescar recencia
  wins.set(
    windowIndex,
    tokens.map((token) => ({
      line: token.line + startLine,
      startChar: token.startChar,
      length: token.length,
      slot: token.slot
    }))
  )
  while (wins.size > MAX_WINDOWS) {
    const oldest = wins.keys().next().value
    if (oldest === undefined) break
    wins.delete(oldest)
  }
  publish(mod, state)
}

/** Para tests: cuántas fuentes están publicando en un módulo. */
export function sourceCount(mod: InnertaModule): number {
  const state = states.get(mod)
  if (!state) return 0
  return new Set([...state.sources.keys(), ...state.windows.keys()]).size
}
