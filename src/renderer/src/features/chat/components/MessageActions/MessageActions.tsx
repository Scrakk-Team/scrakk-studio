// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { IconButton } from '@ui'
import { ProductIcon } from '@services/productIcons/components'
import { showContextMenu } from '@features/editor/engines/innerta/menuHost'
import type { ContextMenuItem } from '@ui'
import { useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import styles from './MessageActions.module.css'

import { t } from '@core/i18n'

interface MessageActionsProps {
  /** Contenido del mensaje a copiar. */
  content: string
  /** Línea de metadatos (modo · duración · tok/s) a la izquierda de la barra. */
  meta?: string
  /** Si viene, se muestra el botón "Regenerar" (última respuesta de la IA). */
  onRegenerate?: () => void
  /**
   * Si viene, se muestra el botón "Editar": el llamador abre el editor inline
   * del mensaje.
   */
  onEdit?: () => void
  /**
   * Si viene, se muestra "Volver al mensaje": sube el scroll a SU lugar. Sirve
   * cuando el mensaje está anclado arriba y querés volver al punto donde
   * arranca su respuesta.
   */
  onJumpTo?: () => void
  /** Muestra el botón de tres puntos con el menú contextual (copiar/regenerar). */
  showMenu?: boolean
}

/**
 * Barra de acciones de un mensaje: copiar, editar, volver y regenerar.
 *
 * Los botones son el MISMO `IconButton` que el de enviar del input (mismo
 * primitivo, `shape="rounded"` —el que "encaja" con el input— y `size="sm"`),
 * con su mismo nudge óptico. Así la fila se ve igual que la del composer.
 */
export function MessageActions({
  content,
  meta,
  onRegenerate,
  onEdit,
  onJumpTo,
  showMenu = false
}: MessageActionsProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Si el componente se desmonta antes de los 1.2s, no actualizar estado muerto.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(content)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1200)
  }

  // Menú global de la app (el mismo que el resto de superficies): copiar y,
  // cuando la respuesta es la última, regenerar.
  const openMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const items: ContextMenuItem[] = [
      {
        label: t('chat.copiar.mensaje'),
        icon: <ProductIcon id="copy" size={14} />,
        onClick: handleCopy
      }
    ]
    if (onRegenerate) {
      items.push({
        label: t('chat.regenerar.respuesta'),
        icon: <ProductIcon id="refresh" size={14} />,
        onClick: onRegenerate
      })
    }
    showContextMenu(rect.left, rect.bottom + 4, items)
  }

  return (
    <div className={styles.actions}>
      {meta ? (
        <span className={styles.meta} title={meta}>
          {meta}
        </span>
      ) : null}

      {/* En la respuesta de la IA las acciones viven en el menú de tres
          puntos (fila limpia: métricas · ⋯). En el mensaje del usuario van
          inline, como siempre. */}
      {showMenu ? null : (
        <>
          <IconButton
            shape="rounded"
            size="sm"
            className={styles.nudge}
            label={copied ? t('chat.copiado-2') : t('chat.copiar.mensaje')}
            onClick={handleCopy}
          >
            <ProductIcon id={copied ? 'check' : 'copy'} size={14} />
          </IconButton>

          {onEdit ? (
            <IconButton
              shape="rounded"
              size="sm"
              className={styles.nudge}
              label={t('chat.editar.mensaje')}
              onClick={onEdit}
            >
              <ProductIcon id="pencil" size={14} />
            </IconButton>
          ) : null}

          {onJumpTo ? (
            <IconButton
              shape="rounded"
              size="sm"
              className={styles.nudge}
              label={t('chat.volver.al.mensaje')}
              onClick={onJumpTo}
            >
              <ProductIcon id="arrow-up" size={14} />
            </IconButton>
          ) : null}

          {onRegenerate ? (
            <IconButton
              shape="rounded"
              size="sm"
              className={styles.nudge}
              label={t('chat.regenerar.respuesta')}
              onClick={onRegenerate}
            >
              <ProductIcon id="refresh" size={14} />
            </IconButton>
          ) : null}
        </>
      )}

      {showMenu ? (
        <IconButton
          shape="rounded"
          size="sm"
          className={styles.nudge}
          label={t('chat.mas.acciones')}
          onClick={openMenu}
        >
          <ProductIcon id="more" size={14} />
        </IconButton>
      ) : null}
    </div>
  )
}
