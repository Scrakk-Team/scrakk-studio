// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useMemo, type JSX, type MouseEvent } from 'react'
import { useChats } from '@features/chat'
import { useProviders } from '@features/providers'
import { showAnchoredModal } from '@services/modals'
import { t } from '@core/i18n'
import { ChatUsageModal } from './ChatUsageModal'
import { ChatUsageRing } from './ChatUsageRing'
import { summarizeUsage } from './chatUsage'
import styles from './ChatUsage.module.css'

/**
 * Anillo de contexto del header del chat. Se auto-suscribe al store de chats
 * y a los providers, así que se rellena en vivo mientras el modelo responde
 * sin que `ChatPanel` tenga que re-registrar sus acciones en cada token.
 *
 * Al clickear abre un popover ANCLADO del SISTEMA GLOBAL (`showAnchoredModal`),
 * sin overlay y pegado al botón (como el historial de notificaciones), no un
 * modal centrado hardcodeado.
 */
export function ChatUsageButton(): JSX.Element {
  const { activeSession } = useChats()
  const { activeProvider, getModel } = useProviders()
  const model = activeProvider ? getModel(activeProvider.id) : ''
  const messages = activeSession?.messages
  const summary = useMemo(
    () => summarizeUsage(messages ?? [], activeProvider?.modelsMeta, model),
    [messages, activeProvider?.modelsMeta, model]
  )

  const open = (event: MouseEvent<HTMLButtonElement>): void => {
    // Popover anclado al botón, SIN overlay y pegado a la esquina (igual que
    // el historial de notificaciones), no un modal centrado a pantalla completa.
    const rect = event.currentTarget.getBoundingClientRect()
    showAnchoredModal({
      key: 'chat.usage',
      title: t('layout.uso.del.contexto'),
      anchor: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      width: 280,
      // El botón vive en el footer: el panel abre hacia ARRIBA del input.
      placement: 'above',
      align: 'end',
      render: () => (
        <ChatUsageModal summary={summary} provider={activeProvider?.name ?? ''} model={model} />
      )
    })
  }

  const label = `${t('layout.uso.del.contexto')} · ${summary.percent}%`
  return (
    <button
      type="button"
      className={styles.usageButton}
      title={label}
      aria-label={label}
      aria-haspopup="dialog"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={open}
    >
      <ChatUsageRing percent={summary.percent} />
    </button>
  )
}
