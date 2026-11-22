// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Panel de tabs — la lista VERTICAL de todas las tabs abiertas.
 *
 * Es la contraparte del modo "tabs acopladas": cuando el strip horizontal del
 * centro se oculta, el botón de la activity bar (con `when: 'tabsDocked'`)
 * abre ESTE panel, donde las tabs se ven, se activan y se cierran.
 *
 * No reimplementa nada: lee el `tabsStore` y usa las MISMAS acciones que el
 * TabStrip (`activateTabSmart` / `closeTabSmart` / `tabIconFor` / `tabLabelFor`).
 */

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { HeaderActionButton, usePanelTitle } from '@features/layout'
import {
  activateTabSmart,
  closePanelTabEverywhere,
  closeTabSmart,
  tabIconFor,
  tabLabelFor
} from '../../actions'
import { tabsStore, setTabsDocked, type StripId, type StripState, type TabSpec } from '@features/tabs'
import styles from './TabsPanel.module.css'

import { t } from '@core/i18n'
/** Fila de la lista: strip + tab juntos, para poder actuar sobre ambos. */
interface TabRow {
  stripId: StripId
  strip: StripState
  tab: TabSpec
}

/** ¿La tab ofrece botón de cierre? (las fijas / no cerrables no). */
function isClosable(tab: TabSpec): boolean {
  return tab.fixed !== true && tab.closable !== false
}

/**
 * Panel con la lista vertical de tabs. Solo aporta su contenido: el frame con
 * el título y las acciones lo pone el sistema de layouts.
 */
export function TabsPanel(): JSX.Element {
  const { setTitle, setActions } = usePanelTitle()
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setTitle(t('layout.panel.tabs'))
  }, [setTitle])

  // Re-render con CUALQUIER cambio del store (alta/baja/activa/reorden).
  useEffect(() => tabsStore.subscribe(() => setVersion((v) => v + 1)), [])
  void version

  // Botón del header: desacoplar (volver a la barra horizontal arriba). Al
  // hacerlo, este panel se cierra: existía solo para el modo acoplado.
  useEffect(() => {
    setActions(() => (
      <HeaderActionButton
        id="tabs.undock"
        label={t('layout.tabs.arriba')}
        icon="arrow-up"
        size="sm"
        onClick={() => {
          setTabsDocked(false)
          closePanelTabEverywhere('tabs')
        }}
      />
    ))
    return () => setActions(null)
  }, [setActions])

  const rows: TabRow[] = []
  for (const strip of Object.values(tabsStore.getAll())) {
    for (const tab of strip.tabs) rows.push({ stripId: strip.stripId, strip, tab })
  }

  if (rows.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.placeholder}>
          <ProductIcon id="file-multiple" size={24} className={styles.icon} aria-hidden="true" />
          <p className={styles.empty}>{t('layout.tabs.ninguna')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <ul className={styles.list} aria-label={t('layout.panel.tabs')}>
        {rows.map(({ stripId, strip, tab }) => {
          const label = tabLabelFor(stripId, tab)
          const Icon = tabIconFor(tab)
          const active = strip.activeId === tab.id
          return (
            <li key={`${stripId}:${tab.id}`} className={styles.item}>
              <button
                type="button"
                className={[styles.row, active ? styles.rowActive : null].filter(Boolean).join(' ')}
                aria-current={active}
                title={label}
                onClick={() => activateTabSmart(stripId, tab)}
              >
                <span className={styles.rowIcon} aria-hidden="true">
                  {Icon ? <Icon size={14} /> : <ProductIcon id="file" size={14} />}
                </span>
                <span className={styles.rowLabel}>{label}</span>
              </button>
              {isClosable(tab) ? (
                <button
                  type="button"
                  className={styles.close}
                  aria-label={`${t('common.cerrar')} ${label}`}
                  title={t('common.cerrar')}
                  onClick={() => closeTabSmart(stripId, tab)}
                >
                  <ProductIcon id="close" size={12} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
