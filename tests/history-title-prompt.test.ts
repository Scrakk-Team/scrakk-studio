// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El título de la conversación se pide en la PRIMERA respuesta. Estos tests
 * fijan las dos piezas: la guía dinámica de la tool y el bloque que el system
 * prompt agrega solo en la primera ronda.
 */

import { describe, expect, it } from 'vitest'
import { definition } from '../src/renderer/src/services/ai/tools/history_title/definition'
import { prompt } from '../src/renderer/src/services/ai/tools/history_title/prompt'
import { buildSystemPrompt } from '../src/renderer/src/services/ai/prompts/systemPrompt'

describe('history_title — guía dinámica', () => {
  it('pide llamarla una vez al inicio de una conversación nueva', () => {
    expect(prompt).toMatch(/exactly once/i)
    expect(prompt).toMatch(/start of a new conversation/i)
    expect(prompt).toMatch(/first response/i)
  })

  it('no repite la descripción (así se renderiza como Guidance)', () => {
    expect(prompt.trim()).not.toBe(definition.function.description.trim())
  })

  it('también lleva el momento en la descripción de la función', () => {
    expect(definition.function.description).toMatch(/start of a new conversation/i)
  })
})

describe('system prompt — bloque de título', () => {
  it('lo incluye en la primera ronda', () => {
    const system = buildSystemPrompt(null, true)
    expect(system).toContain('<conversation_title>')
    expect(system).toContain('history_title')
  })

  it('no lo repite en turnos posteriores', () => {
    expect(buildSystemPrompt(null, false)).not.toContain('<conversation_title>')
  })
})
