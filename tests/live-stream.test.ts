// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El stream vivo no entra al contexto global: se acumula acá y se commitea
 * una sola vez al cerrar la ronda.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetLiveStreamForTests,
  appendLiveContent,
  appendLiveReasoning,
  beginLiveSegment,
  commitLiveSegment,
  getLiveSnapshot,
  hasLiveSegment,
  setLiveTools
} from '../src/renderer/src/features/chat/state/liveStream'

describe('liveStream', () => {
  beforeEach(() => {
    _resetLiveStreamForTests()
  })

  it('acumula contenido y razonamiento sin tocar el historial', () => {
    beginLiveSegment('s1', { id: 'm1', timestamp: 1, mode: 'default', model: 'demo' })
    expect(hasLiveSegment('s1')).toBe(true)
    expect(getLiveSnapshot('s1')).toMatchObject({ id: 'm1', content: '', role: 'assistant' })

    appendLiveContent('s1', 'hola')
    appendLiveReasoning('s1', 'pienso')
    expect(getLiveSnapshot('s1')).toMatchObject({
      content: 'hola',
      reasoning: 'pienso',
      mode: 'default',
      model: 'demo'
    })
  })

  it('el snapshot es estable hasta que hay un cambio', () => {
    beginLiveSegment('s1', { id: 'm1', timestamp: 1 })
    const first = getLiveSnapshot('s1')
    expect(getLiveSnapshot('s1')).toBe(first)
    appendLiveContent('s1', 'x')
    expect(getLiveSnapshot('s1')).not.toBe(first)
  })

  it('incluye tools y hace un solo commit al historial', () => {
    beginLiveSegment('s1', { id: 'm1', timestamp: 1 })
    appendLiveContent('s1', 'listo')
    setLiveTools(
      's1',
      [{ id: 't1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
      { t1: { content: 'ok', success: true } },
      { t1: 'success' }
    )
    const snapshot = commitLiveSegment('s1')
    expect(snapshot).toMatchObject({
      id: 'm1',
      content: 'listo',
      tool_calls: [{ id: 't1' }],
      tool_statuses: { t1: 'success' }
    })
    expect(hasLiveSegment('s1')).toBe(false)
    expect(getLiveSnapshot('s1')).toBeNull()
    expect(commitLiveSegment('s1')).toBeNull()
  })
})
