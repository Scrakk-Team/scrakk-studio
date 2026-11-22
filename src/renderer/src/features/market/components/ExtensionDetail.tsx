// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, useState, type JSX } from 'react'
import { ProductIcon } from '@services/productIcons/components'
import { UserAvatar } from '@features/social'
import {
  getAccounts,
  getActiveAccount,
  loadActiveAccount,
  subscribeToActiveAccount
} from '@services/account'
import type { AccountSummary } from '@shared/account'
import { useMarket } from '../state/MarketContext'
import { Stars } from './Stars'
import styles from '../market.module.css'

import { t } from '@core/i18n'
/** Convierte un link de YouTube al embed (si aplica); si no, lo deja igual. */
function toEmbed(url: string): string {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url)
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : url
}

/** Captura que se oculta sola si la URL falla (no deja un hueco vacío). */
function ScreenImage({ src }: { src: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      className={styles.screen}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/** Detalle de una extensión: install, repo, media, valoraciones. */
export function ExtensionDetail(): JSX.Element | null {
  const market = useMarket()
  const {
    detail,
    detailRatings,
    detailRelease,
    accountId,
    installed,
    busy,
    install,
    rate,
    report,
    openEditor
  } = useMarket()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // Fallback local: si el main todavía no trae el perfil del rating propio,
  // usamos la cuenta activa del store global (foto + nombre reales).
  const [myAccount, setMyAccount] = useState<AccountSummary | null>(null)
  useEffect(() => {
    const sync = (): void => {
      const id = getActiveAccount() ?? accountId
      setMyAccount(getAccounts()?.accounts.find((a) => a.id === id) ?? null)
    }
    sync()
    void loadActiveAccount().then(sync)
    return subscribeToActiveAccount(sync)
  }, [accountId])

  // Si el usuario ya valoró esta extensión, precargamos su valoración para
  // poder editarla en vez de empezar de cero (y el form dice "Actualizar").
  const myRating = detailRatings.find((rating) => rating.isMine) ?? null
  useEffect(() => {
    if (myRating) {
      setStars(myRating.stars)
      setComment(myRating.comment ?? '')
    }
  }, [myRating?.id, myRating?.stars, myRating?.comment])

  if (!detail) return null

  const mine = accountId !== null && detail.owner === accountId
  // Por ID (el slug del market == el id del paquete SEF), no por nombre: un
  // nombre cambia y dejaba el detalle creyendo que seguía instalada.
  const installedEntry = installed.find((e) => e.id.toLowerCase() === detail.slug.toLowerCase())
  const isInstalled = Boolean(installedEntry)
  // "Al día" = la versión INSTALADA es la última. Antes se comparaba el release
  // cacheado del server contra el latestVersion del server (siempre iguales), así
  // que el botón quedaba deshabilitado para cualquier cosa "instalada".
  const upToDate = isInstalled && installedEntry?.version === detail.latestVersion
  const installing = busy === `install:${detail.slug}`

  const doInstall = async (): Promise<void> => {
    setMessage(null)
    const result = await install(detail)
    setMessage(result.ok ? t('market.instalada') : result.error)
  }

  const doRate = async (): Promise<void> => {
    if (stars < 1) return
    const result = await rate(detail.slug, stars, comment)
    if (result.ok) {
      // Mantenemos las estrellas: ahora es la valoración propia (editable).
      setMessage(t('market.rate.guardada'))
    } else {
      setMessage(result.error)
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        {detail.iconUrl ? (
          <img className={styles.detailIcon} src={detail.iconUrl} alt="" />
        ) : (
          <span className={[styles.detailIcon, styles.cardIconFallback].join(' ')}>
            <ProductIcon id="extensions" size={24} />
          </span>
        )}
        <div className={styles.cardInfo}>
          <span className={styles.detailTitle}>
            {detail.name}
            {detail.verified ? (
              <span className={styles.verified} title={t('market.verificado')}>
                <ProductIcon id="verified-badge" size={14} />
              </span>
            ) : null}
          </span>
          <span className={styles.detailAuthor}>
            {detail.ownerName ?? detail.ownerHandle ?? '—'}
            {detail.ownerVerified ? ` · ${t('market.autor.verificado')}` : ''}
          </span>
          <span className={styles.metaRow}>
            {detail.ratingCount > 0 ? <Stars value={detail.ratingAvg} /> : null}
            <span>{t('market.descargas', { count: String(detail.downloads) })}</span>
            {detailRelease ? (
              <span>
                {t('market.ultima.version')} v{detailRelease.version}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <div className={styles.detailActions}>
        <button
          type="button"
          className={styles.btn}
          disabled={installing || upToDate}
          onClick={() => void doInstall()}
        >
          <ProductIcon id={installing ? 'refresh' : 'download'} size={13} />
          {installing
            ? t('market.instalando')
            : isInstalled
              ? t('market.actualizar')
              : t('market.instalar')}
        </button>
        <a
          className={styles.ghost}
          href={detail.repoUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ProductIcon id="globe" size={13} />
          {t('market.ver.repo')}
        </a>
        {mine ? (
          // Editá tu propia extensión desde la ficha: abre EL MISMO form de
          // publicación, pero con los datos cargados (imágenes e icono incluidos)
          // y guarda por `id` en vez de crear una nueva.
          <button
            type="button"
            className={styles.ghost}
            onClick={() => openEditor(detail)}
          >
            <ProductIcon id="pencil" size={13} />
            {t('market.editar')}
          </button>
        ) : null}
        {mine && !detail.featured && !detail.featuredRequested ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              void market.requestFeatured(detail.slug).then((res) =>
                setMessage(res.ok ? t('market.destacada.solicitada') : res.error)
              )
            }
          >
            <ProductIcon id="crown" size={13} />
            {t('market.destacada.solicitar')}
          </button>
        ) : null}
        {!mine ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void report({ slug: detail.slug, reason: 'report' }).then(() => setMessage(t('market.reportar.enviado')))}
          >
            {t('market.reportar')}
          </button>
        ) : null}
      </div>

      {message ? <p className={styles.hint}>{message}</p> : null}

      {detail.description ? (
        <div>
          <h4 className={styles.sectionTitle}>{t('market.descripcion')}</h4>
          <p className={styles.text}>{detail.description}</p>
        </div>
      ) : null}

      {detail.screenshots.length > 0 ? (
        <div className={styles.screens}>
          {detail.screenshots.map((src) => <ScreenImage key={src} src={src} />)}
        </div>
      ) : null}

      {detail.videoUrl ? (
        <iframe
          className={styles.preview}
          src={toEmbed(detail.videoUrl)}
          title={detail.name}
          allowFullScreen
          loading="lazy"
        />
      ) : null}

      <div>
        <h4 className={styles.sectionTitle}>{t('market.permisos')}</h4>
        <p className={styles.hint}>{t('market.permisos.nota')}</p>
      </div>

      <div>
        <h4 className={styles.sectionTitle}>{t('market.valoraciones')}</h4>
        {detailRatings.length === 0 ? (
          <p className={styles.hint}>{t('market.sin.valoraciones')}</p>
        ) : (
          detailRatings.map((r) => {
            // La cuenta local manda en el rating propio (el main puede venir
            // con código viejo que no resuelve el perfil desde Supabase).
            const own = r.isMine ? myAccount : null
            const name =
              own?.displayName ?? own?.handle ?? r.userName ?? r.userHandle ?? '?'
            return (
            <div key={r.id} className={styles.ratingItem}>
              <UserAvatar
                name={name}
                src={own?.avatarUrl ?? r.userAvatar ?? undefined}
                size={26}
              />
              <div className={styles.ratingBody}>
                <span className={styles.ratingHead}>
                  <span className={styles.ratingName}>{name}</span>
                  <Stars value={r.stars} />
                </span>
                {r.comment ? <span className={styles.text}>{r.comment}</span> : null}
              </div>
            </div>
            )
          })
        )}

        {!accountId ? (
          <p className={styles.hint}>{t('market.rate.requiere.cuenta')}</p>
        ) : mine ? (
          <p className={styles.hint}>{t('market.rate.propia')}</p>
        ) : (
          <div className={styles.field}>
            <span className={styles.label}>
              {myRating ? t('market.rate.actualizar') : t('market.rate.titulo')}
            </span>
            {/* Estrellas clickeables: elegí 1–5 y el botón se habilita. */}
            <Stars value={stars} onRate={setStars} />
            <textarea
              className={styles.textarea}
              placeholder={t('market.comentario.placeholder')}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <button
              type="button"
              className={styles.btn}
              disabled={stars < 1}
              onClick={() => void doRate()}
            >
              {myRating ? t('market.rate.actualizar') : t('market.rate.enviar')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
