// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Normalización de tool calls SOLO para mostrarlas.
 *
 * Algunos gateways no-conformantes re-emiten la misma tool bajo un id nuevo con
 * únicamente los primeros argumentos. El dedup por id no los une (los ids son
 * distintos), así que el chat pinta una card completa y otra parcial.
 *
 * El caso que se ve en la práctica es `task`: la card buena trae
 * `subagent_type` + `prompt`, y la fantasma solo `subagent_type` (sin prompt, o
 * sea, una call que además no se puede ejecutar). Si hay una `task` completa con
 * el mismo subagente, la parcial se oculta. No se tocan otras tools ni calls
 * con prompt propio: dos subagentes distintos siguen mostrando dos cards.
 */

import type { ToolCallInfo } from './types'

function parsedObject(value: string): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function collapsePartialToolCalls(calls: ToolCallInfo[]): ToolCallInfo[] {
  if (calls.length < 2) return calls
  const parsed = calls.map((call) => parsedObject(call.function.arguments.trim()))

  return calls.filter((call, index) => {
    if (call.function.name !== 'task') return true
    const short = parsed[index]
    if (!short || typeof short.prompt === 'string') return true
    const agent = short.subagent_type
    if (typeof agent !== 'string') return true

    return !calls.some((other, otherIndex) => {
      if (otherIndex === index) return false
      if (other.function.name !== 'task') return false
      const long = parsed[otherIndex]
      return (
        long !== null &&
        long.subagent_type === agent &&
        typeof long.prompt === 'string' &&
        long.prompt.trim().length > 0
      )
    })
  })
}
