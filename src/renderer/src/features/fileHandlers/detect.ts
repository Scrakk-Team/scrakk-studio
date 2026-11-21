// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Detección del handler de un archivo.
 *
 * Combina extensión + globs + languageId (`detectLanguageFromPath`) + esquema,
 * igual que un `FileIconTheme` resuelve su ícono. Sin tabla global de formatos:
 * cada handler declara su propio `match` y acá solo se resuelve quién gana.
 */

import { detectLanguageFromPath } from '@features/editor/languages'
import type { FileHandler, FileHandlerMatch } from './types'

/** Esquema de las tabs VIRTUALES: `scrakk-view://<handlerId>/<payload>`. */
export const VIRTUAL_SCHEME = 'scrakk-view'

/** Arma el path virtual de un handler (`scrakk-view://image/…`). */
export function virtualPathOf(handlerId: string, payload = ''): string {
  const clean = payload.replace(/^\/+/, '')
  return `${VIRTUAL_SCHEME}://${handlerId}${clean ? `/${clean}` : ''}`
}

/** Id del handler de un path virtual ('' si no lo es). */
export function virtualIdOf(path: string): string {
  if (schemeOf(path) !== VIRTUAL_SCHEME) return ''
  const rest = path.slice(`${VIRTUAL_SCHEME}://`.length)
  return rest.split('/')[0] ?? ''
}

/** `foo/Bar.TS` → `ts` ('' si no tiene extensión). */
export function extensionOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** `foo/Bar.ts` → `Bar.ts`. */
export function baseNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

/** `scrakk-view://x` → `scrakk-view`; un path normal → `file`. */
export function schemeOf(path: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(path)
  if (!m) return 'file'
  const scheme = m[1].toLowerCase()
  // En Windows `C:\...` parece un esquema: una letra sola no lo es.
  return scheme.length === 1 ? 'file' : scheme
}

/** Glob mínimo (`*` = cualquier cosa, `?` = un char), sin regex exóticas. */
export function matchesGlob(basename: string, glob: string): boolean {
  const pattern = glob
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
    .replace(/\\\?/g, '.')
  return new RegExp(`^${pattern}$`, 'i').test(basename)
}

/** ¿El handler agarra este archivo? */
export function matches(handler: FileHandler, path: string): boolean {
  const m: FileHandlerMatch = handler.match
  const scheme = schemeOf(path)
  // Un `matchAll` tampoco reclama paths sintéticos: el texto es fallback de
  // archivos REALES; un diff (`scrakk-diff://…/readme.md`) pertenece a su dueño.
  if (m.matchAll) return scheme === 'file'

  if (m.scheme) {
    if (m.scheme !== scheme) return false
  } else if (scheme !== 'file') {
    // Un handler que matchea por EXTENSIÓN no reclama un path sintético. Sin
    // esto, la tab de diff de un `readme.md` (`scrakk-diff://…/readme.md`) la
    // ganaba el visor de markdown y el editor nunca aparecía; lo mismo con
    // cualquier formato que comparta la extensión del archivo diffeado. Un path
    // con esquema propio pertenece a quien lo inventó, o a un handler que lo
    // declare explícitamente.
    return false
  }
  if (m.extensions?.length && !m.extensions.includes(extensionOf(path))) return false
  if (m.globs?.length && !m.globs.some((g) => matchesGlob(baseNameOf(path), g))) return false
  if (m.languageIds?.length) {
    const lang = detectLanguageFromPath(path)
    if (!lang || !m.languageIds.includes(lang)) return false
  }
  return true
}

/**
 * El handler de mayor prioridad que matchea. Los `fallback` sólo se consideran
 * si NO hay ningún handler normal que matchee (así el texto no roba visores).
 * `null` = ninguno (el dispatcher igual cae al editor).
 */
export function pickHandler(handlers: FileHandler[], path: string): FileHandler | null {
  let best: FileHandler | null = null
  let fallback: FileHandler | null = null
  for (const handler of handlers) {
    if (!matches(handler, path)) continue
    if (handler.fallback) {
      if (!fallback || (handler.priority ?? 0) > (fallback.priority ?? 0)) fallback = handler
      continue
    }
    if (!best || (handler.priority ?? 0) > (best.priority ?? 0)) best = handler
  }
  return best ?? fallback
}
