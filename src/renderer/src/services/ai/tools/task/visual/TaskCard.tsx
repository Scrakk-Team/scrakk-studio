// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * TaskCard — visual custom de la tool `task`.
 *
 * Shimmer mientras corre; la card es **clickeable** (también mientras corre)
 * para abrir el subagente en su modal dentro del chat.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { ToolShimmerText } from '@services/ai/tool-shell'
import { agentRegistry, sessionIdForToolCall, subagentSessions } from '@services/ai/agents'

import { t } from '@core/i18n'
interface TaskCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
  /** `runId`/`toolCallId` los setea ToolCallsBlock (el 2º llega enseguida). */
  execution?: { runId?: string; toolCallId?: string }
}

export function TaskCard({ args, status, execution }: TaskCardProps): JSX.Element | null {
  // Re-render cuando cambia ESTA sesión (o mientras todavía no se conoce el
  // runId, para engancharlo en vivo). El store emite el id: con muchos
  // subagentes, una task no se redibuja por los deltas de las otras.
  const [version, setVersion] = useState(0)
  const toolCallId = execution?.toolCallId
  const resolvedRunId =
    execution?.runId ?? (toolCallId ? sessionIdForToolCall(toolCallId) : undefined)
  const lastUpdateRef = useRef(0)
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const push = (): void => {
      lastUpdateRef.current = Date.now()
      setVersion((v) => v + 1)
    }
    const unsubscribe = subagentSessions.subscribe((changedId) => {
      if (resolvedRunId && changedId !== resolvedRunId) return
      // La card solo muestra la última línea: 20 fps por CADA subagente es
      // puro paint demás. 5 fps alcanzan y dejan aire al canvas del editor.
      const elapsed = Date.now() - lastUpdateRef.current
      if (elapsed >= 200) {
        push()
        return
      }
      if (pendingUpdateRef.current !== null) return
      pendingUpdateRef.current = setTimeout(() => {
        pendingUpdateRef.current = null
        push()
      }, 200 - elapsed)
    })
    return () => {
      unsubscribe()
      if (pendingUpdateRef.current !== null) {
        clearTimeout(pendingUpdateRef.current)
        pendingUpdateRef.current = null
      }
    }
  }, [resolvedRunId])
  void version

  const id = typeof args.subagent_type === 'string' ? args.subagent_type : ''
  const prompt = typeof args.prompt === 'string' ? args.prompt : ''
  const label = agentRegistry.getSubagent(id)?.label ?? id
  const runId = resolvedRunId
  const session = runId ? subagentSessions.get(runId) : undefined

  const open = (): void => {
    if (!runId) return
    window.dispatchEvent(
      new CustomEvent('subagent:open', { detail: { sessionId: runId, title: label } })
    )
  }

  if (status === 'pending' || status === 'streaming' || status === 'running') {
    // Progreso EN VIVO en el chat principal: la última línea con contenido del
    // subagente, sin necesidad de abrir el modal.
    const live = lastContentLine(session?.messages)
    const body = live ? (
      <span className="task-card__live">{live}</span>
    ) : (
      <ToolShimmerText text={`${label || 'Subagente'}…`} />
    )
    return runId ? (
      <button type="button" className="task-card" title={t('misc.abrir.el.subagente')} onClick={open}>
        {body}
      </button>
    ) : (
      body
    )
  }
  if (!id) return null

  const body = (
    <>
      <span className="task-card__agent">{label}</span>
      {prompt ? <span className="task-card__prompt"> · {prompt}</span> : null}
    </>
  )
  if (!runId) return <span className="task-card__static">{body}</span>
  return (
    <button type="button" className="task-card" title={t('misc.abrir.el.subagente')} onClick={open}>
      {body}
    </button>
  )
}

/**
 * Última línea con contenido del subagente (para el progreso en vivo de la
 * card). Busca el assistant más reciente que tenga texto y devuelve su última
 * línea no vacía, recortada para que entre en una sola línea.
 */
function lastContentLine(
  messages: Array<{ role: string; content: string }> | undefined
): string {
  if (!messages) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'assistant') continue
    const lines = messages[i].content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    return lines[lines.length - 1].slice(0, 140)
  }
  return ''
}
