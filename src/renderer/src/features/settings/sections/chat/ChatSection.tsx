// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Sección Chat — padre de las preferencias del chat con IA.
 *
 * Agrupa Proveedores (API keys y modelo), Herramientas (qué tools ve el
 * modelo) y Skills (workflows en .scrakk/skills). Cada hijo tiene su pantalla;
 * acá solo vive la introducción y los accesos directos.
 */

import type { JSX } from 'react'
import type { SettingsSectionId } from '../index'
import styles from './ChatSections.module.css'

import { t } from '@core/i18n'
/** Abre Ajustes en una sección (evento global, sin acoplarse al feature). */
function goTo(section: SettingsSectionId): void {
  window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }))
}

export function ChatSection(): JSX.Element {
  return (
    <div className={styles.section}>
      <div className={styles.headerText}>
        <h3>{t('settings.nav.chat')}</h3>
        <p>{t('settings.preferencias.del.chat.con.ia')}</p>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>{t('settings.proveedores')}</span>
        <span className={styles.hint}>{t('settings.modelos.y.claves.de.api')}</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatProviders')}
          >
            {t('settings.abrir.proveedores')}
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>{t('settings.herramientas')}</span>
        <span className={styles.hint}>{t('settings.que.puede.usar.la.ia')}</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatTools')}
          >
            {t('settings.abrir.herramientas')}
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>{t('settings.skills')}</span>
        <span className={styles.hint}>{t('settings.flujos.de.trabajo.reutilizables')}</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatSkills')}
          >
            {t('settings.abrir.skills')}
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>{t('settings.agentes')}</span>
        <span className={styles.hint}>{t('settings.perfiles.permisos.y.subagentes')}</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatAgents')}
          >
            {t('settings.abrir.agentes')}
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>{t('settings.permisos')}</span>
        <span className={styles.hint}>{t('settings.que.se.permite.se.pregunta')}</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatPermissions')}
          >
            {t('settings.abrir.permisos')}
          </button>
        </div>
      </div>
    </div>
  )
}
