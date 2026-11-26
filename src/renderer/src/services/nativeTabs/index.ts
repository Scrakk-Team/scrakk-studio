// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Preferencia: tabs nativas (WASM de Innerta) en vez del strip React. */

const KEY = 'scrakk-studio:native-tabs'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

let enabled = read()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

export function isNativeTabsEnabled(): boolean {
  return enabled
}

export function setNativeTabsEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch { /* sin storage: solo memoria */ }
  emit()
}

export function subscribeToNativeTabs(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
