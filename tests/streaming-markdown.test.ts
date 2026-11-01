// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El stream de markdown se corta en bloques cerrados fuera de los fences; solo
 * la cola viva se vuelve a parsear. Sin timers.
 */

import { describe, expect, it } from 'vitest'
import { splitStableMarkdown } from '../src/renderer/src/features/chat/components/Markdown'

describe('splitStableMarkdown', () => {
  it('sin línea vacía no hay bloques estables', () => {
    expect(splitStableMarkdown('texto que sigue creciendo')).toEqual({
      blocks: [],
      tail: 'texto que sigue creciendo'
    })
  })

  it('separa párrafos cerrados y deja el último como cola', () => {
    expect(splitStableMarkdown('uno\n\ndos\n\ntres')).toEqual({
      blocks: ['uno', 'dos'],
      tail: 'tres'
    })
  })

  it('no corta dentro de un fence abierto', () => {
    const source = 'intro\n\n```ts\nconst a = 1\n\nconst b = 2\n'
    expect(splitStableMarkdown(source)).toEqual({
      blocks: ['intro'],
      tail: '```ts\nconst a = 1\n\nconst b = 2\n'
    })
  })

  it('incluye el fence cerrado como bloque estable', () => {
    const source = '```ts\nconst a = 1\n```\n\ndespués'
    expect(splitStableMarkdown(source)).toEqual({
      blocks: ['```ts\nconst a = 1\n```'],
      tail: 'después'
    })
  })

  it('soporta fences con ~ y fences más largos', () => {
    const source = '~~~~\n\ncode\n~~~~\n\ncola'
    expect(splitStableMarkdown(source)).toEqual({
      blocks: ['~~~~\n\ncode\n~~~~'],
      tail: 'cola'
    })
  })

  it('mantiene el texto vacío como cola vacía', () => {
    expect(splitStableMarkdown('')).toEqual({ blocks: [], tail: '' })
  })
})
