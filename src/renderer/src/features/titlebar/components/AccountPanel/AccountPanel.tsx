// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de cuentas que abre el menú hamburger de la titlebar.
 *
 * Reutiliza el MISMO `AccountSwitcher` del panel social: cambiar de cuenta
 * acá publica en el store global `activeAccount`, así la tienda ("mis
 * extensiones") y el social siguen a la cuenta nueva. La FOTO de la cuenta
 * activa se muestra en la propia opción "Cuenta" del menú (ver MenuBar).
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { AccountSwitcher } from '@features/social'
import {
  account as accountService,
  getAccounts,
  getActiveAccount,
  loadActiveAccount,
  setActiveAccount,
  subscribeToActiveAccount
} from '@services/account'
import type { AccountList } from '@shared/account'

interface AccountPanelProps {
  /** Cierra el modal anclado (lo pasa el MenuBar). */
  onClose: () => void
}

export function AccountPanel({ onClose }: AccountPanelProps): JSX.Element {
  const [accounts, setAccounts] = useState<AccountList>(
    () => getAccounts() ?? { activeId: null, accounts: [] }
  )
  const [activeId, setActiveId] = useState<string | null>(() => getActiveAccount())

  useEffect(() => {
    const sync = (): void => {
      setActiveId(getActiveAccount())
      const list = getAccounts()
      if (list) setAccounts(list)
    }
    sync()
    void loadActiveAccount().then(sync)
    return subscribeToActiveAccount(sync)
  }, [])

  const changeAccount = useCallback((id: string): void => {
    void accountService.setDefault(id).then((result) => {
      if (result.ok) {
        setAccounts(result.data)
        setActiveAccount(id, result.data)
        onClose()
      }
    })
  }, [onClose])

  const removeAccount = useCallback(async (id: string) => {
    const result = await accountService.removeAccount(id)
    if (result.ok) {
      setAccounts(result.data)
      const next = result.data.activeId ?? result.data.accounts[0]?.id ?? ''
      setActiveAccount(next, result.data)
    }
    return { ok: result.ok, error: result.ok ? undefined : result.error }
  }, [])

  const beginAdd = useCallback((): void => {
    // El flujo de alta vive en el panel social; lo abrimos y mostramos ahí.
    onClose()
    window.dispatchEvent(new CustomEvent('scrakk:open-social-add-account'))
  }, [onClose])

  return (
    <AccountSwitcher
      accounts={accounts}
      activeId={activeId}
      onSwitch={changeAccount}
      onOpenProfile={onClose}
      onRemove={removeAccount}
      onAdd={beginAdd}
      onClose={onClose}
    />
  )
}
