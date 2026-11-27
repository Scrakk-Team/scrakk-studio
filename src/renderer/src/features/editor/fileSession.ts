// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sesiones de archivo (multi-editor).
 *
 * Un archivo abierto = una SESIÓN dentro del motor compartido de su panel
 * (strip). El módulo WASM guarda, por sesión, el estado COMPLETO (texto, undo,
 * cursor, scroll, folds), así que cambiar de tab es activar otra sesión:
 * instantáneo y sin perder nada.
 *
 * Antes cada archivo tenía su PROPIO módulo WASM (+ canvas + GL): abrir N
 * archivos costaba N instancias y, al superar el tope de módulos en background,
 * se evictaba sesiones (perdiendo el undo). Eso ya no existe.
 *
 * El motor por panel se crea la primera vez que ese panel muestra un archivo.
 */

import { getOrCreatePaneEngine, listPaneEngines, releasePaneEngineIfEmpty } from './engine'
import type { InnertaEngine } from './engines/innerta/InnertaEngine'
import { clearProvidedContent, getProvidedContent, type ProvidedContent } from './providedContent'
import { diag } from './sessionDiag'
import { readEncoded, setDetected } from '@services/encodings'
import { lspNotifyFileChanged } from '@services/lsp'

export interface FileSession {
  readonly path: string
  /** Monta la sesión en el host del panel (crea el motor la 1ª vez). */
  attach(host: HTMLElement, paneId?: string): void
  /** Pausa visual: el estado vive en la sesión del motor. */
  detach(host?: HTMLElement): void
  /** Destruye la sesión (cerrar la tab). */
  destroy(): void
  /** Buffer actual de la sesión (undefined si todavía no está lista). */
  getText(): string | undefined
  /** Revisión actual del buffer (undefined si no está lista). */
  getRevision(): number | undefined
  /** ¿El buffer difiere de lo persistido? */
  isDirty(): boolean
  /** Revisión confirmada en disco tras un save exitoso. */
  markClean(revision: number): void
  /** ¿La sesión está viva en algún motor? */
  hasLiveModule(): boolean
  /** Cambios de dirty (punto en tab / guardia de cierre). */
  onDidChangeDirty(cb: (dirty: boolean) => void): () => void
  /** Cambios de contenido (getter del texto + revisión). El texto completo NO
   *  se re-serializa por cada tecla: se pide on-demand al vencimiento. */
  onDidChangeContent(cb: (getText: () => string | undefined, revision: number) => void): () => void
}

class FileSessionImpl implements FileSession {
  readonly path: string
  /** Motor del panel donde vive esta sesión. */
  private engine: InnertaEngine | null = null
  /** Panel (strip) donde vive ahora. */
  private paneId = 'center'
  private loading = false
  /** Texto de una sesión que venía de un panel viejo (mover la tab). */
  private carriedText: string | null = null

  private dirty = false
  private dirtyListeners = new Set<(dirty: boolean) => void>()
  private contentListeners = new Set<(getText: () => string | undefined, revision: number) => void>()
  private lastContentRevision = -1
  private unsubRevision: (() => void) | null = null

  constructor(path: string) {
    this.path = path
  }

  attach(host: HTMLElement, paneId = 'center'): void {
    const engine = getOrCreatePaneEngine(paneId)
    // Mover la tab a otro panel: la sesión de ESTE motor no la tiene. Se
    // lleva el texto (se pierde el undo de ese salto, documentado).
    if (this.engine && this.engine !== engine) {
      const previous = this.engine
      const previousPane = this.paneId
      const text = previous.fileSessionText(this.path)
      if (typeof text === 'string') this.carriedText = text
      previous.dropFileSession(this.path)
      // Si el panel anterior quedó sin archivos, se libera su módulo (GL +
      // WASM): antes quedaba vivo para siempre y el drag acumulaba motores.
      releasePaneEngineIfEmpty(previousPane)
    }
    this.paneId = paneId
    this.engine = engine
    engine.attach(host)
    this.subscribeEngine()
    void this.ensureSession()
  }

  /**
   * Re-key de la sesión cuando el archivo se renombra en disco: el buffer (y
   * su estado dirty) sobrevive bajo la ruta nueva, para que guardar no cree
   * un archivo aparte con el nombre viejo.
   */
  rekey(newPath: string): void {
    if (newPath === this.path) return
    const engine = this.engine
    if (engine) {
      engine.renameSession(this.path, newPath)
      const text = engine.fileSessionText(this.path)
      const wasDirty = this.dirty || engine.fileSessionDirty(this.path)
      engine.dropFileSession(this.path)
      if (typeof text === 'string') {
        engine.createFileSession(newPath, text)
        if (!wasDirty) {
          engine.markFileSessionClean(newPath, engine.fileSessionRevision(newPath) ?? 0)
        }
      }
    }
    // `path` es readonly para los consumidores; acá lo re-asignamos a propósito.
    ;(this as { path: string }).path = newPath
    this.subscribeEngine()
  }

  private subscribeEngine(): void {
    this.unsubRevision?.()
    this.unsubRevision =
      this.engine?.onRevision?.(() => {
        // El motor emite por el archivo ACTIVO: solo importa cuando es éste.
        if (this.engine?.currentFileSessionId() !== this.path) return
        this.recomputeDirty()
        this.emitContent()
      }) ?? null
  }

  /**
   * Aplica el modo sólo lectura del motor según lo que declare el contenido
   * provisto de la sesión ACTIVA.
   *
   * El modo vive en el MOTOR (un módulo por panel), no en la sesión: al cambiar
   * de tab dentro del mismo panel hay que re-aplicarlo, o el read-only de la tab
   * de diff se quedaría pegado en el archivo siguiente.
   */
  private applyReadOnly(engine: InnertaEngine, provided: ProvidedContent | undefined): void {
    engine.setReadOnly(provided?.readOnly === true)
  }

  /**
   * Activa una sesión ya creada SIN esperar a `whenReady()`: es el camino
   * caliente al cambiar de pestaña. El motor ya tiene el buffer, así que el
   * switch debe ser inmediato (mismo comportamiento que el explorer nativo).
   */
  activateNow(): boolean {
    const engine = this.engine
    if (!engine || !engine.hasFileSession(this.path)) return false
    engine.activateFileSession(this.path)
    this.applyReadOnly(engine, getProvidedContent(this.path))
    this.recomputeDirty()
    return true
  }

  /** Crea la sesión si no existe (contenido provisto, disco o snapshot) y la activa. */
  private async ensureSession(): Promise<void> {
    const engine = this.engine
    if (!engine) {
      diag('ensureSession: sin engine', this.path)
      return
    }
    diag('ensureSession: start', this.path)
    // Fast path: si el motor YA tiene el buffer, activar sin pasar por
    // `whenReady()` (eso metía un tick de async en cada cambio de tab).
    if (engine.hasFileSession(this.path)) {
      diag('ensureSession: already have session (sync)', this.path)
      this.activateNow()
      return
    }
    await engine.whenReady()
    diag('ensureSession: engine ready', this.path)
    if (!this.engine || this.engine !== engine) return

    // Contenido provisto por la app (tab de diff): no se lee el disco con un
    // path sintético — la lectura fallaría y la tab quedaría en blanco.
    const provided = getProvidedContent(this.path)

    if (this.loading) return
    this.loading = true
    try {
      let text: string | null = this.carriedText
      this.carriedText = null
      if (text === null && provided) {
        text = provided.text
      }
      if (text === null) {
        diag('ensureSession: reading from disk', this.path)
        const res = await readEncoded(this.path)
        diag('ensureSession: readEncoded result', {
          success: res.success,
          hasText: typeof res.text === 'string',
          textLen: typeof res.text === 'string' ? res.text.length : 0,
          detected: res.detected ? res.detected.encoding : null,
          error: res.error ?? null
        })
        if (res.success && typeof res.text === 'string' && res.detected) {
          setDetected(this.path, res.text, res.detected)
          text = res.text
          void lspNotifyFileChanged(this.path, res.text)
        }
      }
      if (!this.engine || this.engine !== engine) {
        diag('ensureSession: engine swapped during load', this.path)
        return
      }
      // El contenido viaja por chunks (createFileSession es async): el motor
      // pinta el principio del archivo mientras el resto llega desde disco.
      diag('ensureSession: createFileSession start', this.path)
      await engine.createFileSession(this.path, text ?? '')
      diag('ensureSession: createFileSession done', this.path)
      this.applyReadOnly(engine, provided)
      // Recién cargado = limpio.
      const revision = engine.fileSessionRevision(this.path) ?? 0
      engine.markFileSessionClean(this.path, revision)
      this.setDirty(false)
      diag('ensureSession: done', this.path)
    } catch (err) {
      // Lectura fallida: la sesión queda vacía — ahora con log.
      diag('ensureSession: FALLÓ', err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.loading = false
    }
  }

  /**
   * Emite el cambio SIN re-marshalear el buffer entero en cada tecla.
   *
   * El texto completo viaja por un getter: quien lo necesite lo pide cuando
   * lo necesite (típicamente en un debounce). Antes de esto, cada keystroke
   * copiaba 33 MB dentro WASM → JS, y como los únicos consumidores (LSP y
   * extension host) además debounceean, ese marshal era puro desperdicio y
   * explicaba por qué tipear en archivos enormes se sentía trabado.
   */
  private emitContent(): void {
    if (this.contentListeners.size === 0) return
    const revision = this.engine?.fileSessionRevision(this.path)
    if (typeof revision !== 'number') return
    if (revision === this.lastContentRevision) return
    this.lastContentRevision = revision
    const getText = (): string | undefined => this.engine?.fileSessionText(this.path)
    for (const listener of [...this.contentListeners]) {
      try {
        listener(getText, revision)
      } catch {
        // Un listener roto no tumba la sesión.
      }
    }
  }

  private recomputeDirty(): void {
    const fromEngine = this.engine?.fileSessionDirty(this.path)
    this.setDirty(typeof fromEngine === 'boolean' ? fromEngine : this.dirty)
  }

  private setDirty(dirty: boolean): void {
    if (dirty === this.dirty) return
    this.dirty = dirty
    for (const cb of this.dirtyListeners) {
      try {
        cb(dirty)
      } catch {
        // Un listener roto no tumba la sesión.
      }
    }
  }

  detach(_host?: HTMLElement): void {
    // El estado vive en la sesión del motor: no hay nada que soltar.
  }

  destroy(): void {
    this.unsubRevision?.()
    this.unsubRevision = null
    this.engine?.dropFileSession(this.path)
    // Última tab del panel: liberar el motor (WASM + GL).
    releasePaneEngineIfEmpty(this.paneId)
    this.engine = null
    this.carriedText = null
    this.dirtyListeners.clear()
    this.contentListeners.clear()
    sessions.delete(this.path)
  }

  hasLiveModule(): boolean {
    return this.engine?.hasFileSession(this.path) ?? false
  }

  getText(): string | undefined {
    return this.engine?.fileSessionText(this.path)
  }

  getRevision(): number | undefined {
    return this.engine?.fileSessionRevision(this.path)
  }

  isDirty(): boolean {
    const fromEngine = this.engine?.fileSessionDirty(this.path)
    if (typeof fromEngine === 'boolean') return fromEngine
    return this.dirty
  }

  markClean(revision: number): void {
    this.engine?.markFileSessionClean(this.path, revision)
    this.recomputeDirty()
  }

  onDidChangeDirty(cb: (dirty: boolean) => void): () => void {
    this.dirtyListeners.add(cb)
    return () => {
      this.dirtyListeners.delete(cb)
    }
  }

  onDidChangeContent(cb: (getText: () => string | undefined, revision: number) => void): () => void {
    this.contentListeners.add(cb)
    // Estado actual (el archivo puede estar cargado y quieto hace rato).
    this.emitContent()
    return () => {
      this.contentListeners.delete(cb)
    }
  }

  /** Re-setea el buffer con texto ya re-decodificado (reabrir con encoding). */
  async reloadText(text: string): Promise<void> {
    const engine = this.engine
    if (!engine) return
    await engine.createFileSession(this.path, text)
    const revision = engine.fileSessionRevision(this.path) ?? 0
    engine.markFileSessionClean(this.path, revision)
    this.setDirty(false)
  }
}

const sessions = new Map<string, FileSessionImpl>()

/** ¿El archivo tiene cambios sin guardar? (false si ni siquiera está abierto). */
export function isFileDirty(path: string): boolean {
  return sessions.get(path)?.isDirty() ?? false
}

/**
 * Métricas para Ajustes → Rendimiento. Con un motor por panel, "módulos en
 * background" ya no aplica: se informa cuántos motores de panel hay vivos.
 */
export function backgroundModuleCount(): number {
  return listPaneEngines().length
}

/** Suma de heaps WASM reales de los motores de panel vivos. */
export function totalEditorHeapBytes(): number {
  let total = 0
  for (const engine of listPaneEngines()) {
    total += engine.heapBytes()
  }
  return total
}

/** No-op: las sesiones ya viven en el motor (no se evictan módulos). */
export function applyBackgroundCapNow(): void {}

/** Sesión viva del archivo (se crea la primera vez que se pide). */
export function getFileSession(path: string): FileSession {
  let session = sessions.get(path)
  if (!session) {
    session = new FileSessionImpl(path)
    sessions.set(path, session)
  }
  return session
}

/** Fast path síncrono para cambiar de tab: activa el buffer ya existente. */
export function activateFileSessionNow(path: string): boolean {
  return sessions.get(path)?.activateNow() ?? false
}

/**
 * Cambia la ruta de una sesión viva (rename desde el explorer). Mantiene el
 * MISMO objeto FileSession, así la tab no pierde su buffer ni su estado dirty.
 */
export function renameFileSession(oldPath: string, newPath: string): void {
  const session = sessions.get(oldPath)
  if (!session) return
  session.rekey(newPath)
  sessions.delete(oldPath)
  sessions.set(newPath, session)
}

/** Destruye la sesión de un archivo (al cerrar su tab). */
export function destroyFileSession(path: string): void {
  sessions.get(path)?.destroy()
  // El contenido provisto vive mientras la tab viva (si no, se acumularía
  // memoria por cada diff cerrado).
  clearProvidedContent(path)
}

/** ¿Existe sesión viva para el path? */
export function hasFileSession(path: string): boolean {
  return sessions.has(path)
}

/** Buffer de la sesión del archivo (para guardar). */
export function getFileSessionText(path: string): string | undefined {
  return sessions.get(path)?.getText()
}

/**
 * Recarga el contenido de la sesión (acción "reabrir con encoding"): descarta
 * los cambios y re-setea el buffer con el texto ya re-decodificado.
 */
export async function reloadFileContent(path: string, text: string): Promise<void> {
  await sessions.get(path)?.reloadText(text)
}
