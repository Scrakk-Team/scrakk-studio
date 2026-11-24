// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Modo compacto (experimental): quita la separación entre paneles y deja un
 * solo borde de 1px como VS Code, en TODO el chrome a la vez (paneles,
 * titlebar, statusbar y activity bars). El layout por defecto NO se toca.
 *
 * El estado se publica como `data-compact-chrome` en <html> para que el CSS
 * global pueda aplicar los overrides sin tocar los class names de CSS modules.
 */

const KEY = 'scrakk-studio:compact-chrome'
const ATTR = 'data-compact-chrome'

type Listener = () => void
const listeners = new Set<Listener>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let enabled = read()

function applyAttribute(): void {
  if (typeof document === 'undefined') return
  if (enabled) document.documentElement.setAttribute(ATTR, '')
  else document.documentElement.removeAttribute(ATTR)
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

export function isCompactChromeEnabled(): boolean {
  return enabled
}

export function setCompactChromeEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch { /* sin storage: solo memoria */ }
  applyAttribute()
  emit()
}

export function subscribeToCompactChrome(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Se llama una vez al arrancar para reflejar la preferencia persistida. */
export function installCompactChrome(): () => void {
  applyAttribute()
  return () => {
    if (typeof document !== 'undefined') document.documentElement.removeAttribute(ATTR)
  }
}

/** Solo tests. */
export function _resetCompactChromeForTests(): void {
  enabled = false
  listeners.clear()
  if (typeof document !== 'undefined') document.documentElement.removeAttribute(ATTR)
}
