// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Botón de cuenta en la titlebar: foto de la cuenta activa + selector.
 *
 * Reutiliza el MISMO `AccountSwitcher` del panel social (y su UserAvatar),
 * para que cambiar de cuenta aquí tenga el mismo efecto que en el social:
 * el store global `activeAccount` publica el cambio y la tienda actualiza
 * "mis extensiones" al instante.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { AccountSwitcher, UserAvatar } from '@features/social'
import {
  account as accountService,
  getAccounts,
  getActiveAccount,
  loadActiveAccount,
  setActiveAccount,
  subscribeToActiveAccount
} from '@services/account'
import type { AccountList } from '@shared/account'
import { t } from '@core/i18n'
import styles from './AccountButton.module.css'

export function AccountButton(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountList>(
    () => getAccounts() ?? { activeId: null, accounts: [] }
  )
  const [activeId, setActiveId] = useState<string | null>(() => getActiveAccount())
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  // Cerrar al hacer click fuera (capture: el propio botón se gestiona acá).
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = accounts.accounts.find((a) => a.id === activeId)
  const label = current?.displayName ?? current?.handle ?? current?.email ?? t('social.cuentas')

  const changeAccount = useCallback((id: string): void => {
    void accountService.setDefault(id).then((result) => {
      if (result.ok) {
        setAccounts(result.data)
        setActiveAccount(id, result.data)
        setOpen(false)
      }
    })
  }, [])

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
    setOpen(false)
    window.dispatchEvent(new CustomEvent('scrakk:open-social-add-account'))
  }, [])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current ? (
          <UserAvatar name={label} src={current.avatarUrl ?? undefined} size={20} />
        ) : (
          <span className={styles.guest}>?</span>
        )}
      </button>
      {open ? (
        <div className={styles.popover}>
          <AccountSwitcher
            accounts={accounts}
            activeId={activeId}
            onSwitch={changeAccount}
            onOpenProfile={() => setOpen(false)}
            onRemove={removeAccount}
            onAdd={beginAdd}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  )
}
