// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ChatMessage } from '@services/chat'
import { memo, useCallback, useEffect, useRef, useSyncExternalStore, type JSX } from 'react'
import {
  getLiveSnapshot,
  hasLiveSegment,
  subscribeToLiveStream
} from '@features/chat'
import { MessageBubble } from '../MessageBubble/MessageBubble'
import { ThinkingState } from '../ThinkingState/ThinkingState'
import { ThoughtBlock } from '../ThoughtBlock/ThoughtBlock'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
  /** true mientras un stream está en curso (el último mensaje se está armando). */
  isStreaming: boolean
  /** Sesión cuyo stream vivo se dibuja al final (fuera del historial). */
  liveSessionId?: string | null
  /** Regenera la última respuesta (el botón solo se muestra en el último mensaje). */
  onRegenerate?: () => void
  /**
   * Guarda la edición de un mensaje. El panel decide qué implica (el usuario
   * reenvía con el texto nuevo; la IA sólo actualiza su contenido).
   */
  onEditMessage?: (messageId: string, content: string) => void
  /** Clase extra sobre el root (p. ej. para acotar el ancho de la columna). */
  className?: string
}

/**
 * Mensaje VIVO: es el ÚNICO componente que se re-renderiza por token.
 * El historial (`messages`) queda estable durante toda la ronda.
 */
const LiveAssistantMessage = memo(function LiveAssistantMessage({
  sessionId,
  onGrow
}: {
  sessionId: string
  onGrow?: () => void
}): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null)
  const message = useSyncExternalStore(subscribeToLiveStream, () =>
    getLiveSnapshot(sessionId)
  )
  useEffect(() => {
    const root = rootRef.current
    if (!root || !onGrow) return undefined
    const observer = new ResizeObserver(onGrow)
    observer.observe(root)
    return () => observer.disconnect()
  }, [onGrow])
  if (!message) return null
  const hasReasoning = Boolean(message.reasoning)
  const hasToolCalls = Boolean(message.tool_calls?.length)
  const thinking = !message.content && !hasToolCalls
  return (
    <div
      ref={rootRef}
      className={styles.messageWrap}
      data-thought={hasReasoning ? '' : undefined}
    >
      {hasReasoning ? (
        <ThoughtBlock reasoning={message.reasoning ?? ''} thinking={thinking} />
      ) : null}
      {thinking ? (
        hasReasoning ? null : <ThinkingState />
      ) : (
        <MessageBubble message={message} pending canEdit={false} />
      )}
    </div>
  )
})

/**
 * Lista scrollable con scroll inteligente:
 * - Al montar (cambio de sesión) va al fondo, donde están los últimos mensajes.
 * - Al crecer, solo sigue al fondo si el usuario ya estaba cerca del fondo.
 *
 * Mientras el modelo piensa (stream sin contenido todavía) se muestra el
 * shimmer "Thinking"; el razonamiento va en el bloque "Thought for Ns".
 *
 * Usa el scrollbar global (réplica de Innerta): sin rail custom.
 */
export const MessageList = memo(function MessageList({
  messages,
  isStreaming,
  liveSessionId = null,
  onRegenerate,
  onEditMessage,
  className
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  /** ¿El usuario estaba pegado al fondo? Se actualiza solo en scroll real. */
  const atBottomRef = useRef(true)
  const hasLive = useSyncExternalStore(subscribeToLiveStream, () =>
    hasLiveSegment(liveSessionId)
  )
  /** Cantidad de mensajes de la última sonda DEV (ver el efecto de abajo). */
  const probeCountRef = useRef(-1)

  /**
   * Sonda de huecos (solo DEV).
   *
   * El "Thought" aparecía lejísimos de los tools de la ronda anterior y los
   * `gap` del CSS no lo explicaban. Esto mide el hueco REAL entre mensajes
   * consecutivos y lo reporta cuando pasa de un umbral, con el índice del
   * mensaje: así se ve si el aire es de un margen o de un elemento con altura
   * (un bloque colapsado, un placeholder, un tamaño estimado).
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Sólo cuando CAMBIA la cantidad de mensajes: si corriera en cada delta de
    // contenido mediría TODOS los mensajes (`getBoundingClientRect`) ~1 vez por
    // frame — puro costo durante el stream.
    if (messages.length === probeCountRef.current) return
    probeCountRef.current = messages.length
    const el = listRef.current
    if (!el) return
    const handle = requestAnimationFrame(() => {
      // Los mensajes viven dentro del turno: `:scope > div` serían los turnos.
      const wraps = el.querySelectorAll<HTMLElement>(':scope > div > div')
      let prevBottom = Number.NaN
      const report: string[] = []
      wraps.forEach((wrap, index) => {
        const rect = wrap.getBoundingClientRect()
        const gap = rect.top - prevBottom
        if (Number.isFinite(gap) && gap > 4) {
          const hasThought = Boolean(wrap.querySelector('[aria-expanded]'))
          const prev = wraps[index - 1]
          report.push(
            `#${index}${hasThought ? '(Thought)' : ''} +${Math.round(gap)}px ` +
              `[prev alto ${Math.round(prev?.getBoundingClientRect().height ?? 0)}px]`
          )
        }
        prevBottom = rect.bottom
      })
      if (report.length > 0) console.warn(`[chat] huecos: ${report.join(' | ')}`)
    })
    return () => cancelAnimationFrame(handle)
  }, [messages])

  // Scroll automático: al montar al fondo; después, la última burbuja se ancla
  // ARRIBA mientras crece (para leerla desde el principio) y, si ya entra en el
  // viewport, se sigue el fondo como siempre.
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    if (!mountedRef.current) {
      mountedRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }

    // Un mensaje TUYO es una acción tuya: se baja siempre. Si estabas leyendo
    // historial, mandar y no ver lo que mandaste es peor que perder el lugar.
    const last = messages[messages.length - 1]
    if (last?.role === 'user') {
      el.scrollTop = el.scrollHeight
      atBottomRef.current = true
      return
    }

    // `atBottom` se mantiene con el evento scroll, no leyendo scrollHeight/
    // clientHeight en cada frame del stream.
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  /**
   * TURNOS: un mensaje tuyo + lo que vino después hasta el próximo tuyo.
   *
   * Es lo que hace posible el ancla SIN tocar el scroll: el mensaje tuyo es
   * `position: sticky` dentro de su turno, así se queda pegado arriba mientras
   * leés su respuesta y el turno siguiente lo empuja afuera (el comportamiento
   * de un encabezado sticky). Recalcular el ancla con JS y una clase parpadeaba:
   * al mover el sticky de un mensaje a otro, el nuevo aparecía de golpe en el
   * tope desde afuera de la pantalla.
   */
  const turns: Array<{ key: string; items: ChatMessage[] }> = []
  for (const message of messages) {
    // Sin un mensaje tuyo al principio (sesión restaurada), el primer turno
    // arranca igual: es la respuesta la que va arriba.
    if (message.role === 'user' || turns.length === 0) {
      turns.push({ key: message.id, items: [] })
    }
    turns[turns.length - 1].items.push(message)
  }
  const lastId = messages[messages.length - 1]?.id
  // El ancla es SOLO la última pregunta. `sticky` la pega recién cuando llega al
  // tope: si está más abajo (recién mandada), se queda donde está — no salta a
  // anclarse. Y la anterior NUNCA se ancla: se va scrolleando como cualquier
  // mensaje.
  let lastUserId = ''
  for (const message of messages) {
    if (message.role === 'user') lastUserId = message.id
  }

  /**
   * Sube el scroll al lugar REAL del mensaje anclado.
   *
   * `position: sticky` lo pega al tope, así que su rect ya no es su sitio: se
   * mide un instante sin el sticky y se restaura. Dos lecturas de layout en un
   * click (no en el scroll), que es lo que mantiene el scroll sin trabajo.
   */
  const jumpToAnchor = useCallback((): void => {
    const el = listRef.current
    const target = el?.querySelector<HTMLElement>('[data-anchor-message]')
    if (!el || !target) return
    target.style.position = 'static'
    const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top
    target.style.position = ''
    el.scrollTo({ top: el.scrollTop + delta, behavior: 'smooth' })
  }, [])

  /** El mensaje vivo creció: seguir el fondo solo si el usuario ya estaba ahí. */
  const handleLiveGrow = useCallback((): void => {
    const el = listRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [])

  return (
    <div
      ref={listRef}
      className={className ? `${styles.list} ${className}` : styles.list}
      role="log"
      aria-live={hasLive ? 'off' : 'polite'}
      onScroll={(event) => {
        const el = event.currentTarget
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      }}
    >
      {turns.map((turn, turnIndex) => (
        <div key={turn.key} className={styles.turn}>
          {turn.items.map((message) => {
            const isLast = message.id === lastId
            const isPending = !hasLive && isLast && message.role === 'assistant' && isStreaming
            const hasReasoning = Boolean(message.role === 'assistant' && message.reasoning)
            // Con tool calls el bubble SÍ se dibuja aunque no haya texto todavía:
            // es lo único que muestra la card de la tool (y el subagente en vivo).
            // Sin esto, mientras la tool corre el panel quedaba clavado en
            // "Thinking" y la card recién aparecía al terminar la ronda (o al
            // apretar Detener, que apaga isStreaming).
            const hasToolCalls = Boolean(
              message.role === 'assistant' && message.tool_calls?.length
            )
            const showThinking = isPending && !message.content && !hasToolCalls
            return (
              <div
                key={message.id}
                className={
                  message.id === lastUserId
                    ? `${styles.messageWrap} ${styles.anchor}`
                    : styles.messageWrap
                }
                // El ancla: lo busca `jumpToAnchor` para medir su lugar real.
                data-anchor-message={message.id === lastUserId ? '' : undefined}
                // El Thought cancela el gap de arriba: las rondas de un mismo turno
                // son UN bloque, no mensajes independientes (el aire que se veía
                // era el `gap` de la lista entre la ronda de tools y la siguiente).
                data-thought={hasReasoning ? '' : undefined}
              >
                {hasReasoning ? (
                  // thinking = está razonando todavía (sin contenido): el header
                  // del bloque muestra "Thinking"; al empezar el contenido pasa
                  // a "Thought for Ns" con el tiempo que pensó.
                  <ThoughtBlock
                    reasoning={message.reasoning ?? ''}
                    thinking={isPending && !message.content && !hasToolCalls}
                  />
                ) : null}
                {showThinking ? (
                  // Sin razonamiento visible: el indicador Thinking va solo.
                  hasReasoning ? null : <ThinkingState />
                ) : (
                  <MessageBubble
                    message={message}
                    // Mientras el stream arma el mensaje: sin acciones, y sin
                    // Regenerar hasta que sea la última respuesta ya terminada.
                    pending={isPending}
                    onRegenerate={
                      message.role === 'assistant' && isLast && !isPending && !hasLive
                        ? onRegenerate
                        : undefined
                    }
                    onEditSave={onEditMessage}
                    // Editar mientras el modelo genera dejaría dos verdades a la
                    // vez (el texto nuevo y el stream en curso) — MENOS en la
                    // última pregunta, que es la que estás mirando: ahí el
                    // panel corta el stream antes de reenviar.
                    canEdit={!isStreaming || message.id === lastUserId}
                    // "Volver al mensaje" sólo en el ancla: es la que puede
                    // quedar pegada arriba, lejos de su lugar real.
                    onJumpTo={message.id === lastUserId ? jumpToAnchor : undefined}
                  />
                )}
              </div>
            )
          })}
          {hasLive && liveSessionId && turnIndex === turns.length - 1 ? (
            <LiveAssistantMessage sessionId={liveSessionId} onGrow={handleLiveGrow} />
          ) : null}
        </div>
      ))}
      {hasLive && liveSessionId && turns.length === 0 ? (
        <div className={styles.turn}>
          <LiveAssistantMessage sessionId={liveSessionId} onGrow={handleLiveGrow} />
        </div>
      ) : null}
    </div>
  )
})
