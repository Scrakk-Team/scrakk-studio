// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * FileHandlers — "excepciones" por formato de archivo.
 *
 * Cada handler es una CARPETA autocontenida (igual que los tools de la IA:
 * `tools/<tool>/{definition,executor,visual,index}`) que declara:
 *
 *  - `match`:  qué archivos agarra (extensiones, globs, languageIds, esquema).
 *  - `mode`:   si el archivo es una PIEZA (`view`), TEXTO (`text`) o las dos
 *              (`both`, el caso intermedio tipo markdown).
 *  - `load`:   el componente del visor (import dinámico: no engorda el bundle).
 *  - `actions`: botones que el handler aporta (toolbar del visor + menú de la tab).
 *
 * NADA de esto está hardcodeado en el editor: el dispatcher consulta el
 * registry y elige el handler de mayor prioridad que matchee. Sin match, el
 * archivo lo abre el editor Innerta (texto).
 */

import type { ComponentType } from 'react'

/**
 * Cómo se muestra un archivo:
 *  - `view`  → pieza no-textual (una imagen): el editor no tiene sentido.
 *  - `text`  → legible/editable: lo abre el editor.
 *  - `both`  → intermedio (markdown, svg): visor por defecto, editor con el ojo.
 */
export type FileHandlerMode = 'view' | 'text' | 'both'

/** Qué archivos agarra un handler. Todo opcional: se combinan con AND. */
export interface FileHandlerMatch {
  /** Extensiones sin punto, en minúscula (`['png', 'jpg']`). */
  extensions?: string[]
  /** Globs simples sobre el basename (`['Dockerfile*', '*.min.js']`). */
  globs?: string[]
  /** languageId resuelto por `detectLanguageFromPath`. */
  languageIds?: string[]
  /** Esquema del path (`file`, `scrakk-view`). Si falta, cualquiera. */
  scheme?: string
  /** Matchea TODO (lo usa el handler de texto como fallback). */
  matchAll?: boolean
}

/**
 * Visor modular: una carpeta = `{ logic, extra, ui }`.
 *  - `logic` es liviano (match/mode/priority/actions) y se importa EAGER para
 *    que `resolve(path)` sea sincrónico.
 *  - `extra` (setup, URLs, libs) y `ui` (componente) se importan LAZY.
 */
export interface ViewerModule {
  logic: Omit<FileHandler, 'load'>
  extra?: () => Promise<unknown>
  ui: () => Promise<{ default: ComponentType<FileHandlerViewProps> }>
}

/** Contexto que recibe una acción del handler. */
export interface FileActionContext {
  path: string
  /** Contenido en texto si el archivo es legible; undefined si es binario. */
  content?: string
  notify: (input: { title: string; message?: string }) => void
}

/** Acción declarativa: aparece en la toolbar del visor y en el menú de la tab. */
export interface FileAction {
  id: string
  /** Clave i18n o literal (se resuelve con `msg`). */
  label: string
  /** Id de ProductIcon. */
  icon?: string
  run: (ctx: FileActionContext) => void | Promise<void>
}

export interface FileHandlerViewProps {
  path: string
  /** Contenido en texto si el archivo es legible (para visores tipo markdown). */
  content?: string
}

export interface FileHandler {
  id: string
  match: FileHandlerMatch
  /** Modo natural del formato. */
  mode: FileHandlerMode
  /** Mayor gana cuando varios matchean. Default 0. */
  priority?: number
  /** Componente del visor (sólo si `mode` incluye `view`). */
  load?: () => Promise<{ default: ComponentType<FileHandlerViewProps> }>
  actions?: FileAction[]
  /** Fallback: gana cuando ningún otro handler matchea (lo usa el editor). */
  fallback?: boolean
  /** Se elige explícitamente cuando el archivo resulta ser binario. */
  binaryFallback?: boolean
}
