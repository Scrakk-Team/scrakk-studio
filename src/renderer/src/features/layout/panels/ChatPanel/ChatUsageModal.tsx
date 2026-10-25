// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import { t } from '@core/i18n'
import { ChatUsageRing } from './ChatUsageRing'
import type { ChatUsageSummary } from './chatUsage'
import styles from './ChatUsage.module.css'

interface ChatUsageModalProps {
  summary: ChatUsageSummary
  provider: string
  model: string
  close: () => void
}

const number = new Intl.NumberFormat()
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

/**
 * Contenido del modal de uso. NO se pinta por su cuenta: lo abre el sistema
 * global de modales (`showModal`) desde el anillo del header del chat.
 */
export function ChatUsageModal({ summary, provider, model, close }: ChatUsageModalProps): JSX.Element {
  const limit = summary.contextLimit
  const meta = [
    `${summary.percent}%`,
    limit !== null ? `${number.format(limit)} tokens` : null,
    summary.estimated ? t('layout.estimado') : t('layout.reportado.por.el.proveedor')
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={styles.modal}>
      <div className={styles.head}>
        <div className={styles.headRing}>
          <ChatUsageRing percent={summary.percent} size={64} stroke={6} />
        </div>
        <div className={styles.headText}>
          <span className={styles.value}>{number.format(summary.contextTokens)} tokens</span>
          <span className={styles.meta}>{meta}</span>
        </div>
      </div>

      <dl className={styles.grid}>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.contexto.consumido')}</dt>
          <dd className={styles.number}>{number.format(summary.contextTokens)}</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.precio.consumido')}</dt>
          <dd className={styles.number}>{money.format(summary.cost)}</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.tokens.de.entrada')}</dt>
          <dd className={styles.number}>{number.format(summary.totalPrompt)}</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.tokens.de.salida')}</dt>
          <dd className={styles.number}>{number.format(summary.totalCompletion)}</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.tokens.en.cache')}</dt>
          <dd className={styles.number}>{number.format(summary.totalCached)}</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>{t('layout.respuestas')}</dt>
          <dd className={styles.number}>{number.format(summary.responses)}</dd>
        </div>
      </dl>

      <span className={styles.model}>
        {t('layout.modelo')}: {provider ? `${provider} · ` : ''}
        {model || '—'}
      </span>

      <div className={styles.footer}>
        <button type="button" className={styles.close} onClick={close}>
          {t('layout.cerrar')}
        </button>
      </div>
    </div>
  )
}
