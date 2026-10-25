// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { useMemo, type JSX } from 'react'
import { useChats } from '@features/chat'
import { useProviders } from '@features/providers'
import { HeaderActionButton } from '@features/layout'
import { showModal } from '@services/modals'
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
 * Al clickear abre un modal del SISTEMA GLOBAL (`showModal`), no un modal
 * local hardcodeado.
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

  const open = (): void => {
    showModal({
      title: t('layout.uso.del.contexto'),
      size: 'sm',
      render: (ctx) => (
        <ChatUsageModal
          summary={summary}
          provider={activeProvider?.name ?? ''}
          model={model}
          close={ctx.close}
        />
      )
    })
  }

  return (
    <HeaderActionButton
      id="chat.usage"
      label={`${t('layout.uso.del.contexto')} · ${summary.percent}%`}
      shape="circle"
      className={styles.usageButton}
      onClick={open}
    >
      <ChatUsageRing percent={summary.percent} />
    </HeaderActionButton>
  )
}
