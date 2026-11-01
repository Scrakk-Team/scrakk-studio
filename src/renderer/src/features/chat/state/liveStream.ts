// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Stream VIVO del chat, fuera del contexto global.
 *
 * Mientras la IA genera, el mensaje en curso NO entra a `ChatSessionsContext`:
 * se acumula acá y solo un componente (la burbuja viva) se suscribe. Al cerrar
 * la ronda se hace UN commit al historial. Así el panel, la lista, el usage y
 * el resto del IDE no se re-renderizan por cada token.
 */

import type {
  ChatMessage,
  ChatUsage,
  ToolCallInfo,
  ToolCallStatusType,
  ToolResultInfo
} from '@services/chat/types'

export interface LiveSegmentInit {
  id: string
  mode?: string
  model?: string
  timestamp: number
}

interface LiveSegment {
  id: string
  content: string
  reasoning: string
  mode?: string
  model?: string
  timestamp: number
  durationMs?: number
  usage?: ChatUsage
  toolCalls: ToolCallInfo[]
  toolResults: Record<string, ToolResultInfo>
  toolStatuses: Record<string, ToolCallStatusType>
  snapshot: ChatMessage
}

const segments = new Map<string, LiveSegment>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // Un suscriptor roto no tumba a los demás.
    }
  }
}

function rebuild(segment: LiveSegment): void {
  segment.snapshot = {
    id: segment.id,
    role: 'assistant',
    content: segment.content,
    timestamp: segment.timestamp,
    ...(segment.reasoning ? { reasoning: segment.reasoning } : {}),
    ...(segment.mode ? { mode: segment.mode } : {}),
    ...(segment.model ? { model: segment.model } : {}),
    ...(segment.durationMs !== undefined ? { durationMs: segment.durationMs } : {}),
    ...(segment.usage ? { usage: segment.usage } : {}),
    ...(segment.toolCalls.length > 0 ? { tool_calls: [...segment.toolCalls] } : {}),
    ...(Object.keys(segment.toolResults).length > 0
      ? { tool_results: { ...segment.toolResults } }
      : {}),
    ...(Object.keys(segment.toolStatuses).length > 0
      ? { tool_statuses: { ...segment.toolStatuses } }
      : {})
  }
}

function update(sessionId: string, mutate: (segment: LiveSegment) => void): void {
  const segment = segments.get(sessionId)
  if (!segment) return
  mutate(segment)
  rebuild(segment)
  emit()
}

/** Empieza una ronda viva para la sesión (reemplaza la anterior si existía). */
export function beginLiveSegment(sessionId: string, init: LiveSegmentInit): void {
  const segment: LiveSegment = {
    id: init.id,
    content: '',
    reasoning: '',
    mode: init.mode,
    model: init.model,
    timestamp: init.timestamp,
    toolCalls: [],
    toolResults: {},
    toolStatuses: {},
    snapshot: {
      id: init.id,
      role: 'assistant',
      content: '',
      timestamp: init.timestamp
    }
  }
  segments.set(sessionId, segment)
  rebuild(segment)
  emit()
}

export function appendLiveContent(sessionId: string, delta: string): void {
  if (!delta) return
  update(sessionId, (segment) => {
    segment.content += delta
  })
}

export function appendLiveReasoning(sessionId: string, delta: string): void {
  if (!delta) return
  update(sessionId, (segment) => {
    segment.reasoning += delta
  })
}

export function setLiveTools(
  sessionId: string,
  calls: ToolCallInfo[],
  results: Record<string, ToolResultInfo>,
  statuses: Record<string, ToolCallStatusType>
): void {
  update(sessionId, (segment) => {
    segment.toolCalls = [...calls]
    segment.toolResults = { ...results }
    segment.toolStatuses = { ...statuses }
  })
}

export function setLiveUsage(sessionId: string, usage: ChatUsage): void {
  update(sessionId, (segment) => {
    segment.usage = usage
  })
}

export function setLiveDuration(sessionId: string, durationMs: number): void {
  update(sessionId, (segment) => {
    segment.durationMs = durationMs
  })
}

/** Snapshot inmutable del mensaje vivo, o null si no hay ronda en curso. */
export function getLiveSnapshot(sessionId: string | null | undefined): ChatMessage | null {
  if (!sessionId) return null
  return segments.get(sessionId)?.snapshot ?? null
}

export function hasLiveSegment(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId && segments.has(sessionId))
}

/** Cierra la ronda y devuelve el mensaje final para commitear al historial. */
export function commitLiveSegment(sessionId: string): ChatMessage | null {
  const segment = segments.get(sessionId)
  if (!segment) return null
  segments.delete(sessionId)
  emit()
  return segment.snapshot
}

export function clearLiveSegment(sessionId: string): void {
  if (segments.delete(sessionId)) emit()
}

export function subscribeToLiveStream(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo tests. */
export function _resetLiveStreamForTests(): void {
  segments.clear()
  listeners.clear()
}
