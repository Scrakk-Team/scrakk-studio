// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0

/**
 * Experimental explorer settings.
 *
 * `skipFilesOnExpandAll`: when enabled, "Expand all folders" lists only
 * folders (files stay hidden) to keep huge trees manageable.
 */

const KEY = 'scrakk-studio:explorer-skip-files-expand-all'
const EVENT = 'scrakk:explorer-settings-changed'

type Listener = () => void
const listeners = new Set<Listener>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let value = read()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

export function isSkipFilesOnExpandAll(): boolean {
  return value
}

export function setSkipFilesOnExpandAll(next: boolean): void {
  value = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { next } }))
  emit()
}

export function subscribeExplorerSettings(listener: Listener): () => void {
  listeners.add(listener)
  const onEvent = (): void => listener()
  window.addEventListener(EVENT, onEvent)
  return () => {
    listeners.delete(listener)
    window.removeEventListener(EVENT, onEvent)
  }
}
