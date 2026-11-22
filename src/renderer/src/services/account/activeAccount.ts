// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cuenta activa GLOBAL (anti-hardcode).
 *
 * Antes cada panel leía `listAccounts().activeId` una sola vez al montar: si
 * cambiabas de cuenta en el panel social, la tienda ("mis extensiones") y la
 * titlebar seguían con la cuenta vieja. Este store es la fuente de verdad:
 * el social publica el cambio y todos los consumidores se re-renderizan.
 */

import { api } from '@services/api'
import type { AccountList } from '@shared/account'

const listeners = new Set<() => void>()
let activeId: string | null = null
let accounts: AccountList | null = null

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Suscriptor roto no tumba a los demás.
    }
  }
}

/** Carga la cuenta activa desde el servicio (llamada una vez al arrancar). */
export async function loadActiveAccount(): Promise<string | null> {
  const list = await api.account.listAccounts().catch(() => null)
  if (list?.ok) {
    accounts = list.data
    activeId = list.data.activeId ?? list.data.accounts[0]?.id ?? null
    emit()
  }
  return activeId
}

export function getActiveAccount(): string | null {
  return activeId
}

export function getAccounts(): AccountList | null {
  return accounts
}

/** Publica un cambio de cuenta (lo llama el social / la titlebar). */
export function setActiveAccount(id: string, list?: AccountList): void {
  if (list) accounts = list
  if (activeId === id) {
    emit()
    return
  }
  activeId = id
  emit()
}

export function setAccountsList(list: AccountList): void {
  accounts = list
  emit()
}

export function subscribeToActiveAccount(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
