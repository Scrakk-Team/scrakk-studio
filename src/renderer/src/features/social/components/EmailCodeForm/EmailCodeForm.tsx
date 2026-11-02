// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useCallback, useState, type ChangeEvent, type FormEvent, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { ACCOUNT_RULES } from '@shared/account'
import { LEGAL_LINKS, LEGAL_VERSION, type LegalConsent } from '@shared/legal'
import { getLocale } from '@shared/i18n'
import CodeSlots, { type CodeSlotsStatus } from '../CodeSlots/CodeSlots'
import styles from './EmailCodeForm.module.css'

import { t } from '@core/i18n'
interface EmailCodeFormProps {
  /** Pide el código (dispara el email por la API del CLI/Resend). */
  onRequestCode: (email: string) => Promise<{ ok: boolean; error?: string }>
  /** Verifica el código y abre sesión. */
  onVerifyCode: (
    email: string,
    code: string,
    consent?: LegalConsent
  ) => Promise<{ ok: boolean; error?: string }>
}

/**
 * Ingreso por email + código OTP — el MISMO método que el CLI. Un solo flujo
 * sirve para cuentas nuevas y existentes: pides el código, lo escribes, entras.
 * El código se ingresa con <CodeSlots /> (slots animados) y se verifica solo
 * al completar los 6 dígitos.
 */
export function EmailCodeForm({ onRequestCode, onVerifyCode }: EmailCodeFormProps): JSX.Element {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<CodeSlotsStatus>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  const emailValid = ACCOUNT_RULES.email.test(email.trim())

  const submitEmail = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!emailValid || busy) return
    setBusy(true)
    setError(null)
    const result = await onRequestCode(email.trim())
    setBusy(false)
    if (result.ok) setStep('code')
    else setError(result.error ?? t('social.no.se.pudo.enviar.el'))
  }

  const verify = useCallback(
    async (candidate: string): Promise<void> => {
      if (!ACCOUNT_RULES.code.test(candidate) || busy) return
      setBusy(true)
      setError(null)
      const consent: LegalConsent | undefined = accepted
        ? { version: LEGAL_VERSION, locale: getLocale() }
        : undefined
      const result = await onVerifyCode(email.trim(), candidate, consent)
      setBusy(false)
      if (result.ok) {
        setStatus('success')
      } else {
        setError(result.error ?? t('social.codigo.invalido.o.expirado'))
        setStatus('error')
      }
    },
    [busy, email, accepted, onVerifyCode]
  )

  if (step === 'email') {
    return (
      <form className={styles.form} onSubmit={submitEmail}>
        <div className={styles.head}>
          <ProductIcon id="person" size={18} className={styles.headIcon} />
          <div className={styles.headText}>
            <span className={styles.title}>{t('social.entra.o.crea.tu.cuenta')}</span>
            <span className={styles.subtitle}>
              {t('social.te.mandamos.un.codigo.al')}
            </span>
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('social.email')}</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
            placeholder={t('social.email.placeholder')}
            autoComplete="email"
            spellCheck={false}
            autoFocus
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <label className={styles.consent}>
          <ToggleSwitch
            checked={accepted}
            onChange={setAccepted}
            label={t('social.acepto.los.terminos')}
            disabled={busy}
          />
          <span>{t('social.acepto.los.terminos')}</span>
        </label>
        <p className={styles.consentLinks}>
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noreferrer">
            {t('social.terminos')}
          </a>
          <span aria-hidden="true"> · </span>
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noreferrer">
            {t('social.politica.de.privacidad')}
          </a>
        </p>

        <button type="submit" className={styles.primaryBtn} disabled={!emailValid || busy || !accepted}>
          <ProductIcon id={busy ? 'refresh' : 'arrow-right'} size={14} />
          {busy ? t('social.enviando') : t('social.enviar.codigo')}
        </button>
      </form>
    )
  }

  return (
    <div className={styles.form}>
      <div className={styles.head}>
        <ProductIcon id="key" size={18} className={styles.headIcon} />
        <div className={styles.headText}>
          <span className={styles.title}>{t('social.escribe.el.codigo')}</span>
          <span className={styles.subtitle}>
            {t('social.te.mandamos.un.codigo.de')} <strong>{email.trim()}</strong>.
          </span>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('social.codigo')}</span>
        <div className={styles.codeSlotsWrap}>
          <CodeSlots
            length={6}
            value={code}
            status={status}
            disabled={busy}
            autoFocus
            onChange={(next) => {
              setCode(next)
              if (status !== 'idle') setStatus('idle')
            }}
            onComplete={(candidate) => void verify(candidate)}
            accentColor="var(--color-accent)"
            inkColor="var(--color-text)"
            slotColor="var(--color-surface-raised)"
            digitColor="var(--color-on-accent)"
            dangerColor="var(--color-danger)"
            slotSize={36}
            gap={5}
            radius={10}
            ariaLabel={t('social.codigo.de.verificacion')}
          />
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {busy ? <p className={styles.status}>{t('social.verificando')}</p> : null}

      <div className={styles.footerLinks}>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => {
            setStep('email')
            setCode('')
            setStatus('idle')
            setError(null)
          }}
        >
          {t('social.cambiar.email')}
        </button>
        <button
          type="button"
          className={styles.linkBtn}
          disabled={busy}
          onClick={() => void onRequestCode(email.trim())}
        >
          {t('social.reenviar.codigo')}
        </button>
      </div>
    </div>
  )
}
