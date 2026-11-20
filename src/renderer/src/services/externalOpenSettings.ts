// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Preferencia: al abrir un ARCHIVO desde el explorador del SO (menú contextual
 * "Open with Scrakk Studio"), ocultar los paneles izquierdo y derecho para que
 * el editor quede a ancho completo. Las carpetas abren el explorer, así que no
 * se oculta nada en ese caso.
 *
 * Patrón del repo: clave propia + evento + getter/setter/subscribe.
 */

const KEY = 'scrakk-studio:external-open-hide-panels'
const EVENT = 'scrakk:external-open-settings-changed'

type Listener = () => void
const listeners = new Set<Listener>()

function read(): boolean {
  try {
    // Default ON: es el comportamiento que se pide desde el menú del SO.
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

let value = read()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function isExternalOpenHidePanels(): boolean {
  return value
}

export function setExternalOpenHidePanels(next: boolean): void {
  value = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Sin almacenamiento: solo memoria.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { next } }))
  emit()
}

export function subscribeExternalOpenSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
