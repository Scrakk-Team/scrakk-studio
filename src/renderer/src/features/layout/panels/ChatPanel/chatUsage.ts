// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Uso de contexto y coste de una sesión de chat.
 *
 * La fuente principal es el `usage` que reporta el proveedor para cada
 * respuesta (`stream_options.include_usage`); el coste se calcula con el
 * precio del modelo del catálogo (models.dev). Si un proveedor no reporta
 * usage, se cae a una estimación local por caracteres (~4 por token) para que
 * el anillo y el modal nunca queden vacíos.
 */

import type { ChatMessage, ChatUsage } from '@services/chat'
import type { CatalogModelCost, CatalogModelMeta } from '@shared/modelsDev'

/** Estimación gruesa cuando el proveedor no informa tokens. */
export const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(0, Math.round(text.length / CHARS_PER_TOKEN))
}

/** Coste en USD de un usage con el precio del modelo (USD por 1M tokens). */
export function computeCost(
  cost: CatalogModelCost | undefined,
  usage: Pick<ChatUsage, 'promptTokens' | 'completionTokens' | 'cachedTokens'>
): number | undefined {
  if (!cost) return undefined
  const cached = Math.max(0, usage.cachedTokens ?? 0)
  const freshPrompt = Math.max(0, usage.promptTokens - cached)
  const inputPrice = Number.isFinite(cost.input) ? cost.input : 0
  const outputPrice = Number.isFinite(cost.output) ? cost.output : 0
  const cachePrice = Number.isFinite(cost.cacheRead) ? cost.cacheRead! : inputPrice
  return (
    (freshPrompt * inputPrice + usage.completionTokens * outputPrice + cached * cachePrice) / 1_000_000
  )
}

export interface ChatUsageSummary {
  /** Tokens del último request (prompt + completion): lo que ocupa el contexto. */
  contextTokens: number
  /** Ventana de contexto del modelo, si el catálogo la declara. */
  contextLimit: number | null
  /** 0..100 (redondeado). */
  percent: number
  /** Coste acumulado de la sesión. */
  cost: number
  totalPrompt: number
  totalCompletion: number
  totalCached: number
  responses: number
  /** true = no hay usage del proveedor; los números son estimados. */
  estimated: boolean
}

/** Todo el texto de la conversación (para la estimación local). */
function conversationText(messages: ChatMessage[]): string {
  let out = ''
  for (const message of messages) {
    if (message.content) out += message.content
    if (message.reasoning) out += message.reasoning
    for (const result of Object.values(message.tool_results ?? {})) {
      if (result?.content) out += result.content
    }
  }
  return out
}

export function summarizeUsage(
  messages: ChatMessage[],
  meta: CatalogModelMeta | undefined
): ChatUsageSummary {
  let totalPrompt = 0
  let totalCompletion = 0
  let totalCached = 0
  let cost = 0
  let responses = 0
  let last: ChatUsage | undefined

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) continue
    responses += 1
    last = message.usage
    totalPrompt += message.usage.promptTokens
    totalCompletion += message.usage.completionTokens
    totalCached += message.usage.cachedTokens ?? 0
    // El coste se guardó al recibir el usage (con el precio del modelo de ESE
    // mensaje). Si un mensaje viejo no lo tiene, se usa el precio actual.
    cost += message.usage.cost ?? computeCost(meta?.cost, message.usage) ?? 0
  }

  const estimated = !last
  if (!last) {
    // Sin usage del proveedor: estimación local de la conversación completa.
    const prompt = estimateTokens(conversationText(messages))
    const completion = estimateTokens(
      messages
        .filter((message) => message.role === 'assistant')
        .map((message) => message.content)
        .join('\n')
    )
    totalPrompt = prompt
    totalCompletion = completion
    cost = computeCost(meta?.cost, { promptTokens: prompt, completionTokens: completion }) ?? 0
  }

  const contextTokens = last
    ? last.totalTokens || last.promptTokens + last.completionTokens
    : totalPrompt + totalCompletion
  const contextLimit = meta?.context && meta.context > 0 ? meta.context : null
  const percent =
    contextLimit !== null ? Math.min(100, Math.round((contextTokens / contextLimit) * 100)) : 0

  return {
    contextTokens,
    contextLimit,
    percent,
    cost,
    totalPrompt,
    totalCompletion,
    totalCached,
    responses,
    estimated
  }
}
