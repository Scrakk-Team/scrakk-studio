// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useEffect, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { ProductIcon } from '@services/productIcons/components'
import { t } from '@core/i18n'
import styles from './ImageLightbox.module.css'

interface ImageLightboxProps {
  /** URL de la imagen (data: de las adjuntas del chat). */
  url: string
  alt?: string
  onClose: () => void
}

/**
 * Visor de imágenes del chat: overlay a pantalla completa + imagen en grande.
 *
 * No abre el browser (antes `window.open(url, '_blank')`): las imágenes del
 * chat son `data:` y el usuario quiere verlas adentro del IDE. Portal a
 * `document.body` para que el stacking del panel social no recorte el overlay.
 */
export function ImageLightbox({ url, alt, onClose }: ImageLightboxProps): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label={t('common.cerrar')}
        title={t('common.cerrar')}
      >
        <ProductIcon id="close" size={18} />
      </button>
      {/* Evita que el click en la imagen cierre el visor. */}
      <img
        className={styles.image}
        src={url}
        alt={alt ?? t('social.imagen.adjunta')}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body
  )
}
