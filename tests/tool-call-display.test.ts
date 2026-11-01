// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Dedup de tool calls SOLO para la UI: un gateway puede reemitir la misma call
 * con otro id y solo el primer tramo de argumentos. La card corta sobra.
 */

import { describe, expect, it } from 'vitest'
import { collapsePartialToolCalls } from '../src/renderer/src/services/chat/toolCallDisplay'
import type { ToolCallInfo } from '../src/renderer/src/services/chat/types'

function call(id: string, name: string, args: string): ToolCallInfo {
  return { id, type: 'function', function: { name, arguments: args } }
}

describe('collapsePartialToolCalls', () => {
  it('oculta la task parcial cuando otra tiene los mismos args + prompt', () => {
    const calls = [
      call('a', 'task', '{"subagent_type":"explorer"}'),
      call('b', 'task', '{"subagent_type":"explorer","prompt":"revisa el repo"}')
    ]
    expect(collapsePartialToolCalls(calls).map((entry) => entry.id)).toEqual(['b'])
  })

  it('no colapsa una task parcial de OTRO subagente', () => {
    const calls = [
      call('a', 'task', '{"subagent_type":"reviewer"}'),
      call('b', 'task', '{"subagent_type":"explorer","prompt":"revisa el repo"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })

  it('no colapsa dos tasks completas del mismo subagente', () => {
    const calls = [
      call('a', 'task', '{"subagent_type":"explorer","prompt":"A"}'),
      call('b', 'task', '{"subagent_type":"explorer","prompt":"B"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })

  it('no colapsa calls con argumentos distintos', () => {
    const calls = [
      call('a', 'task', '{"subagent_type":"explorer","prompt":"A"}'),
      call('b', 'task', '{"subagent_type":"explorer","prompt":"B"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })

  it('no colapsa tools distintas con argumentos parecidos', () => {
    const calls = [
      call('a', 'read_file', '{"path":"a"}'),
      call('b', 'write_file', '{"path":"a","content":"x"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })

  it('no colapsa argumentos incompletos (todavía no son JSON)', () => {
    const calls = [
      call('a', 'task', '{"subagent_type":"explorer"'),
      call('b', 'task', '{"subagent_type":"explorer","prompt":"x"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })

  it('mantiene dos calls idénticas: pueden ser dos ejecuciones reales', () => {
    const calls = [
      call('a', 'read_file', '{"path":"a"}'),
      call('b', 'read_file', '{"path":"a"}')
    ]
    expect(collapsePartialToolCalls(calls)).toHaveLength(2)
  })
})
