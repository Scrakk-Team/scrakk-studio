// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Identidad estable de un proyecto.
 *
 * El editor identifica cada proyecto con `<root>/.scrakk/history/id.json`.
 * Ese id es la clave con la que el chat separa su historial: dos carpetas
 * distintas tienen ids distintos, y una carpeta movida conserva el suyo.
 *
 * Si el archivo no existe (o no tiene un id válido) se genera un UUID y se
 * escribe en el proyecto. Mientras el renderer arranca se usa una caché en
 * localStorage para no parpadear; la lectura real siempre manda.
 */

import { api } from '@services/api'

/** Scope de los chats que no pertenecen a ningún proyecto abierto. */
export const NO_PROJECT_ID = '__no_project__'

/** Ruta relativa a la raíz `.scrakk` del proyecto. */
const ID_FILE = 'history/id.json'

/** Caché síncrona (solo para el primer render; se revalida con el archivo). */
const CACHE_KEY = 'scrakk-studio:chat-project-id'

/** Tope defensivo: un id absurdo no puede ser una clave válida. */
const MAX_ID_LENGTH = 200

const idsByRoot = new Map<string, string>()
const pendingByRoot = new Map<string, Promise<string>>()

/** Tope de la caché persistida (el historial de workspaces guarda 20). */
const MAX_CACHED_ROOTS = 32

/** Normaliza solo para comparar/cachear; la ruta real viaja intacta al main. */
function normalizeRoot(root: string): string {
  return root.trim().replace(/[/\\]+$/, '')
}

/** Mapa `raíz → id`; la forma se valida a mano por si el storage se corrompe. */
function readCache(root: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const id = (parsed as Record<string, unknown>)[normalizeRoot(root)]
    return typeof id === 'string' && id.length > 0 ? id : null
  } catch {
    return null
  }
}

function remember(root: string, id: string): void {
  const key = normalizeRoot(root)
  idsByRoot.set(key, id)
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(CACHE_KEY)
    let map: Record<string, string> = {}
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          map = parsed as Record<string, string>
        }
      } catch {
        // Caché corrupta: se reemplaza por una nueva.
      }
    }
    map[key] = id
    const keys = Object.keys(map)
    if (keys.length > MAX_CACHED_ROOTS) {
      for (const old of keys.slice(0, keys.length - MAX_CACHED_ROOTS)) delete map[old]
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch {
    // Sin almacenamiento: queda la caché en memoria.
  }
}

/**
 * Id cacheado para una raíz (síncrono). Es solo una pista para el primer
 * render: `ensureProjectId` vuelve a leer el archivo y corrige si cambió.
 * Sin proyecto devuelve el scope global `NO_PROJECT_ID`.
 */
export function cachedProjectId(root: string | null): string | null {
  if (!root || !root.trim()) return NO_PROJECT_ID
  const key = normalizeRoot(root)
  return idsByRoot.get(key) ?? readCache(key)
}

/**
 * Acepta las formas que puede tener el archivo histórico:
 *  - `{ "id": "uuid" }` (forma que escribe el editor)
 *  - `"uuid"` (JSON string)
 *  - `uuid` (texto plano)
 */
export function parseProjectId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  let candidate: unknown = text
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      candidate = parsed.id
    } catch {
      return null
    }
  } else if (text.startsWith('"') && text.endsWith('"')) {
    try {
      candidate = JSON.parse(text)
    } catch {
      return null
    }
  }

  if (typeof candidate !== 'string') return null
  const id = candidate.trim()
  return id.length > 0 && id.length <= MAX_ID_LENGTH ? id : null
}

function generateProjectId(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  // Fallback improbable (entornos sin WebCrypto).
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

async function readProjectId(root: string): Promise<string | null> {
  const result = await api.scrakk.read({
    scope: 'project',
    relative: ID_FILE,
    projectRoot: root
  })
  return result.ok ? parseProjectId(result.data) : null
}

async function writeProjectId(root: string, id: string): Promise<boolean> {
  const result = await api.scrakk.writeJson({
    scope: 'project',
    relative: ID_FILE,
    projectRoot: root,
    data: { id, createdAt: new Date().toISOString() }
  })
  return result.ok
}

/**
 * Devuelve el id del proyecto, creando `.scrakk/history/id.json` si falta.
 * Las llamadas concurrentes para la misma raíz comparten una sola promesa.
 *
 * Si no se puede escribir (proyecto de solo lectura), usa una clave estable
 * derivada de la ruta para no perder el historial de esta sesión.
 */
export function ensureProjectId(root: string | null): Promise<string> {
  if (!root || !root.trim()) return Promise.resolve(NO_PROJECT_ID)

  const key = normalizeRoot(root)
  const cached = idsByRoot.get(key)
  if (cached) return Promise.resolve(cached)

  const pending = pendingByRoot.get(key)
  if (pending) return pending

  const task = (async (): Promise<string> => {
    const existing = await readProjectId(key)
    if (existing) {
      remember(key, existing)
      return existing
    }

    const generated = generateProjectId()
    const written = await writeProjectId(key, generated)
    const id = written ? generated : `root:${key}`
    remember(key, id)
    return id
  })()
    .catch(() => {
      const fallback = `root:${key}`
      remember(key, fallback)
      return fallback
    })
    .finally(() => pendingByRoot.delete(key))

  pendingByRoot.set(key, task)
  return task
}

/** Solo tests: limpia cachés en memoria. */
export function _resetProjectIdsForTests(): void {
  idsByRoot.clear()
  pendingByRoot.clear()
}
