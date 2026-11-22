// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tema por proyecto (experimental).
 *
 * Con la opción activa, el tema que el usuario pone se guarda en
 * `<root>/.scrakk/theme.json` de ESE proyecto y se reaplica al abrirlo. Al
 * desactivarla se ignora ese archivo y se vuelve al tema que tenía el usuario.
 *
 * El tema del usuario se guarda aparte (localStorage) para no perderlo cuando
 * `activateTheme()` sobrescribe el store global con el tema del proyecto.
 * Patrón del repo: clave propia + getter/setter/subscribe + bridge instalado
 * una vez desde main.tsx.
 */

import {
  activateTheme,
  getActiveThemeId,
  getRegisteredTheme,
  subscribeToThemes
} from '@services/extensions'
import { loadStoredActive, type StoredActiveTheme } from '@services/extensions/types/themes/store'
import { scrakkHandle, scrakkProjectRoot } from '@services/scrakk'

const SETTING_KEY = 'scrakk-studio:project-theme-enabled'
const USER_KEY = 'scrakk-studio:project-theme-user'
const FILE = 'theme.json'
const EVENT = 'scrakk:project-theme-setting-changed'
const THEME_EVENT = 'theme-changed'
const WORKSPACE_EVENT = 'workspace-changed'

type Listener = () => void
const listeners = new Set<Listener>()

function readSetting(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) === '1'
  } catch {
    return false
  }
}

let enabled = readSetting()

function parseStored(raw: string | null): StoredActiveTheme | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredActiveTheme>
    if (typeof parsed.id !== 'string' || typeof parsed.extensionId !== 'string') return null
    return { id: parsed.id, extensionId: parsed.extensionId }
  } catch {
    return null
  }
}

/** Parsea el contenido de `.scrakk/theme.json` (puro, testeable). */
export function parseProjectTheme(data: unknown): StoredActiveTheme | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (typeof value.id !== 'string' || typeof value.extensionId !== 'string') return null
  return { id: value.id, extensionId: value.extensionId }
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function isProjectThemeEnabled(): boolean {
  return enabled
}

/** Sólo cambia la preferencia; el bridge instalado hace el trabajo. */
export function setProjectThemeEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    localStorage.setItem(SETTING_KEY, next ? '1' : '0')
  } catch {
    // Sin almacenamiento: solo memoria.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { next } }))
  }
  emit()
}

export function subscribeToProjectTheme(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tema que tenía el usuario antes de activar la opción. */
function readUserTheme(): StoredActiveTheme | null {
  try {
    return parseStored(localStorage.getItem(USER_KEY))
  } catch {
    return null
  }
}

function writeUserTheme(theme: StoredActiveTheme): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(theme))
  } catch { /* sin storage: solo memoria */ }
}

function clearUserTheme(): void {
  try {
    localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
}

/** Tema actual del sistema (para persistirlo en el proyecto). */
function currentTheme(): StoredActiveTheme | null {
  const id = getActiveThemeId()
  if (!id) return null
  const entry = getRegisteredTheme(id)
  if (!entry) return null
  return { id, extensionId: entry.extensionId }
}

/**
 * Instala el bridge una vez. Devuelve cleanup (StrictMode safe).
 */
export function installProjectThemeService(): () => void {
  if (typeof window === 'undefined') return () => {}

  // Evita que nuestro propio `activateTheme` se guarde como "cambio del usuario".
  let applying = false
  // Si el tema pedido aún no está registrado, se reaplica cuando se registre.
  let pending: StoredActiveTheme | null = null
  // Invalida lecturas async de un proyecto anterior.
  let generation = 0
  let lastEnabled = enabled

  function applyQuietly(theme: StoredActiveTheme): void {
    applying = true
    const ok = activateTheme(theme.id)
    applying = false
    if (ok) {
      pending = null
    } else if (!getRegisteredTheme(theme.id)) {
      // Extensiones aún cargando: se reintenta al registrarse el tema.
      pending = theme
    }
  }

  function captureUserTheme(): void {
    if (readUserTheme()) return
    const current = loadStoredActive() ?? currentTheme()
    if (current) writeUserTheme(current)
  }

  async function saveToProject(): Promise<void> {
    if (!enabled || !scrakkProjectRoot()) return
    const current = currentTheme()
    if (!current) return
    const gen = generation
    await scrakkHandle('project').writeJson(FILE, { ...current })
    if (gen !== generation) return
    // El tema que el usuario acaba de poner pasa a ser su tema global.
    writeUserTheme(current)
  }

  async function restoreUserTheme(): Promise<void> {
    const user = readUserTheme()
    if (!user) return
    const gen = generation
    // Esperar a que el tema registrado (puede ser de una extensión).
    if (getRegisteredTheme(user.id)) applyQuietly(user)
    else pending = user
    if (gen !== generation) return
  }

  async function loadForCurrentProject(): Promise<void> {
    if (!enabled) return
    if (!scrakkProjectRoot()) return
    const gen = ++generation
    const result = await scrakkHandle('project').readJson(FILE)
    if (!enabled || gen !== generation) return
    const theme = parseProjectTheme(result.ok ? result.data : null)
    if (theme) {
      captureUserTheme()
      applyQuietly(theme)
    } else {
      // Proyecto sin tema: volver al del usuario (sin escribir nada).
      await restoreUserTheme()
    }
  }

  const onThemeChanged = (): void => {
    if (!enabled || applying) return
    pending = null
    void saveToProject()
  }

  const onWorkspaceChanged = (): void => {
    if (!enabled) return
    void loadForCurrentProject()
  }

  const onThemesRegistered = (): void => {
    if (!pending) return
    if (!getRegisteredTheme(pending.id)) return
    const next = pending
    applyQuietly(next)
  }

  const onSettingChanged = (): void => {
    if (enabled === lastEnabled) return
    lastEnabled = enabled
    generation++
    if (enabled) {
      captureUserTheme()
      void saveToProject().then(() => loadForCurrentProject())
    } else {
      pending = null
      void restoreUserTheme().then(() => clearUserTheme())
    }
  }

  window.addEventListener(THEME_EVENT, onThemeChanged)
  window.addEventListener(WORKSPACE_EVENT, onWorkspaceChanged)
  const unsubscribeThemes = subscribeToThemes(onThemesRegistered)
  const unsubscribeSetting = subscribeToProjectTheme(onSettingChanged)

  // Si ya estaba activo al arrancar, capturar PRIMERO el tema del usuario (el
  // store global puede venir de un proyecto de la sesión anterior) y después
  // aplicar el tema del proyecto abierto.
  if (enabled) {
    captureUserTheme()
    if (scrakkProjectRoot()) void loadForCurrentProject()
  }

  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChanged)
    window.removeEventListener(WORKSPACE_EVENT, onWorkspaceChanged)
    unsubscribeThemes()
    unsubscribeSetting()
  }
}
