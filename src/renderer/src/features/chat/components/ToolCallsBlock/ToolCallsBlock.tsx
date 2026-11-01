// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * ToolCallsBlock — renders a list of tool calls from an assistant message.
 *
 * Resuelve el meta de cada tool desde el registry (label, íconos, si es
 * expandible, renderBody custom, modo plain) — la UI usa la configuración
 * real de cada tool, no defaults.
 */

import type { JSX } from 'react'
import { memo } from 'react'
import { ToolCallShell, ToolCallIcon, type ToolCallExecution } from '@services/ai/tool-shell'
import type { ToolCallInfo, ToolResultInfo, ToolCallStatusType } from '@services/chat/types'
import { registry } from '@services/ai/tools'
import { sessionIdForToolCall } from '@services/ai/agents'
import styles from './ToolCallsBlock.module.css'

interface ToolCallsBlockProps {
  toolCalls: ToolCallInfo[]
  toolResults?: Record<string, ToolResultInfo>
  /** Estado por tool: pending/running/success/error/blocked. */
  statuses?: Record<string, ToolCallStatusType>
  /** Overall status — fallback when a tool has no explicit status. */
  status?: ToolCallStatusType
}

/**
 * Una fila (ícono + card). MEMO a propósito: el bloque re-renderiza en cada
 * `onToolResult` (`tool_results` es un mapa NUEVO), pero las entradas que no
 * cambiaron conservan su identidad → sólo se re-renderiza la fila que cambió.
 * Con muchas tools, sin esto se re-renderizaban TODAS por cada resultado.
 */
const ToolRow = memo(function ToolRow({
  toolCall,
  resultInfo,
  status
}: {
  toolCall: ToolCallInfo
  resultInfo?: ToolResultInfo
  status: ToolCallStatusType
}): JSX.Element {
  const callStatus: ToolCallStatusType = resultInfo
    ? resultInfo.success
      ? 'success'
      : 'error'
    : status

  // Config real de la tool: label, icono, renderBody, plain…
  const meta = registry.get(toolCall.function.name)?.meta

  const execution: ToolCallExecution = {
    toolCall,
    status: callStatus,
    result: resultInfo?.content,
    filePath: resultInfo?.filePath,
    originalContent: resultInfo?.originalContent,
    modifiedContent: resultInfo?.modifiedContent,
    runId: resultInfo?.runId ?? sessionIdForToolCall(toolCall.id),
    toolCallId: toolCall.id
  }

  return (
    <div className={styles.toolRow}>
      <span className={styles.toolIconBox}>
        <ToolCallIcon toolName={toolCall.function.name} icon={meta?.icon} size={13} />
      </span>
      <div className={styles.toolVisual}>
        <ToolCallShell execution={execution} meta={meta} />
      </div>
    </div>
  )
})

export const ToolCallsBlock = memo(function ToolCallsBlock({
  toolCalls,
  toolResults,
  statuses,
  status = 'running'
}: ToolCallsBlockProps): JSX.Element {
  // Con cualquier card sin resolver, el shimmer animado repinta cada frame y
  // compite con el canvas del editor. Se apaga para TODAS, no solo para >6.
  const running = toolCalls.reduce((count, call) => {
    if (toolResults?.[call.id]) return count
    const current = statuses?.[call.id] ?? status
    return current === 'pending' || current === 'running' || current === 'streaming'
      ? count + 1
      : count
  }, 0)
  return (
    <div className={styles.block} data-crowded={running > 0 ? '' : undefined}>
      {toolCalls.map((tc) => (
        <ToolRow
          key={tc.id}
          toolCall={tc}
          resultInfo={toolResults?.[tc.id]}
          status={statuses?.[tc.id] ?? status}
        />
      ))}
    </div>
  )
})
