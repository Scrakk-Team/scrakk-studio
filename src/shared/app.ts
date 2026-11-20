// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contrato de ciclo de vida de la app (main + preload + renderer).
 *
 * Por ahora: DESINSTALAR. La app detecta cómo se instaló (NSIS en Windows,
 * AppImage / deb / tar.gz en Linux) y dispara el desinstalador correspondiente
 * desde el proceso main. El renderer sólo pide la acción y muestra el error si
 * no se pudo (en éxito la app se cierra sola).
 */

export const APP_IPC = {
  /** Desinstala la app del sistema y sale. */
  uninstall: 'app:uninstall',
  /** El main empuja al renderer las rutas abiertas desde el explorador del SO. */
  openPaths: 'app:open-paths',
  /** El renderer reclama las rutas en cola al arrancar (evita perder el evento). */
  takeOpenPaths: 'app:take-open-paths'
} as const

/** Una ruta recibida del explorador del SO (el main resuelve si es carpeta). */
export interface OpenPathEntry {
  path: string
  isDirectory: boolean
}

export interface OpenPathsPayload {
  paths: OpenPathEntry[]
}

/** Cómo se instaló la app — define cómo se desinstala. */
export type UninstallMethod = 'nsis' | 'appimage' | 'deb' | 'portable' | 'dev' | 'unsupported'

export interface UninstallResult {
  ok: boolean
  /** Formato detectado (para el mensaje/log). */
  method?: UninstallMethod
  /** Motivo del fallo, o la instrucción manual cuando hace falta root. */
  error?: string
}

export interface AppApi {
  /**
   * Desinstala la app del sistema. En éxito, la app se cierra sola (el
   * desinstalador necesita que el proceso termine para borrar sus archivos).
   * Si devuelve `ok: false`, la app sigue abierta y hay que mostrar `error`.
   */
  uninstall: () => Promise<UninstallResult>
  /** Suscripción a rutas abiertas desde fuera (menú contextual del SO). */
  onOpenPaths: (listener: (payload: OpenPathsPayload) => void) => () => void
  /** Devuelve y vacía la cola de rutas pendientes del arranque. */
  takeOpenPaths: () => Promise<OpenPathsPayload>
}
