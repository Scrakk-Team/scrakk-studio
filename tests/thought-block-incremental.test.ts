// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Segmentación incremental del "Thought": el stream no puede volver a partir
 * todo el razonamiento en cada frame.
 */

import { describe, expect, it } from 'vitest'
import {
  appendReasoning,
  type IncrementalSentences
} from '../src/renderer/src/features/chat/components/ThoughtBlock/ThoughtBlock'

const empty: IncrementalSentences = { source: '', sentences: [], tail: '' }

describe('appendReasoning', () => {
  it('mantiene la frase incompleta en tail y cierra solo al puntuar', () => {
    let state = appendReasoning(empty, 'Hola')
    expect(state).toMatchObject({ sentences: [], tail: 'Hola' })

    state = appendReasoning(state, 'Hola mundo')
    expect(state).toMatchObject({ sentences: [], tail: 'Hola mundo' })

    state = appendReasoning(state, 'Hola mundo. ')
    expect(state.sentences).toEqual(['Hola mundo.'])
    expect(state.tail).toBe('')
  })

  it('no duplica oraciones ya procesadas', () => {
    let state = appendReasoning(empty, 'Uno. Dos. Tres')
    expect(state.sentences).toEqual(['Uno.', 'Dos.'])
    expect(state.tail).toBe('Tres')

    state = appendReasoning(state, 'Uno. Dos. Tres. Cuatro')
    expect(state.sentences).toEqual(['Uno.', 'Dos.', 'Tres.'])
    expect(state.tail).toBe('Cuatro')
  })

  it('se reinicia si el razonamiento no continúa el anterior', () => {
    const state = appendReasoning(empty, 'Viejo razonamiento.')
    const reset = appendReasoning(state, 'Nuevo')
    expect(reset.sentences).toEqual([])
    expect(reset.tail).toBe('Nuevo')
  })

  it('procesa saltos de línea como cierre de oración', () => {
    const state = appendReasoning(empty, 'línea uno\nlínea dos')
    expect(state.sentences).toEqual(['línea uno'])
    expect(state.tail).toBe('línea dos')
  })
})
