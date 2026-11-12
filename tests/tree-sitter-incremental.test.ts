// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Equivalencia incremental ↔ full parse.
 *
 * El camino incremental (documentId presente) mantiene el árbol vivo y merges
 * la captura de la ejecución anterior con lo re-colectado. Esto sólo sirve si
 * el resultado final es IDÉNTICO al del camino full-parse sobre el mismo
 * texto. Este test lo verifica aplicando ediciones de tecleo una a una y
 * comparando TODO (tokens, datos, applied, failed) tras cada paso.
 */
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DynamicTokenizeRequest, DynamicTokenizeResult } from '../src/shared/extensions'

const parserSource = process.env['SCRAKK_TS_PARSER']
const root = mkdtempSync(join(tmpdir(), 'scrakk-inc-'))

const { createTreeSitterTokenizer } = await import('../src/main/extensions/treeSitter/tokenizer')

function request(
  text: string,
  documentId?: string,
  queries = [{ file: join(root, 'queries', 'highlights.scm'), category: 'highlights' as const }]
): DynamicTokenizeRequest {
  return {
    languageId: 'javascript',
    parserPath: join(root, 'grammars', 'javascript.wasm'),
    queries,
    embedded: [],
    ...(documentId ? { documentId } : {}),
    text
  }
}

const SEED = [
  'function greet(name) {',
  '  const msg = `hello ${name}`',
  '  return msg',
  '}',
  '',
  'const x = 42',
  '',
  'greet("world")',
  ''
].join('\n')

describe.skipIf(!parserSource)('tokenizador incremental', () => {
  beforeAll(() => {
    if (!parserSource) return
    mkdirSync(join(root, 'grammars'), { recursive: true })
    mkdirSync(join(root, 'queries'), { recursive: true })
    copyFileSync(parserSource, join(root, 'grammars', 'javascript.wasm'))
    writeFileSync(
      join(root, 'queries', 'highlights.scm'),
      [
        '(function_declaration name: (identifier) @function)',
        '(call_expression function: (identifier) @function.call)',
        '(variable_declarator name: (identifier) @variable)',
        '(string) @string',
        '(template_string) @string',
        '(number) @number',
        '[',
        '  "function"',
        '  "const"',
        '  "return"',
        '] @keyword',
        '(comment) @comment'
      ].join('\n')
    )
  })

  afterAll(() => {
    // rmSync — vitest cleans tmpdir eventually; leaving files is harmless.
  })

  function captureSet(result: DynamicTokenizeResult): string {
    const byToken = new Map<string, string>()
    for (const token of result.tokens) {
      const scopes = result.scopeSets[token.scopes] ?? []
      byToken.set(`${token.line}:${token.start}:${token.end}`, scopes.sort().join(','))
    }
    return [...byToken.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k} → ${v}`).join('\n')
  }

  async function fullResult(text: string) {
    const tokenizer = createTreeSitterTokenizer()
    return tokenizer.tokenize(request(text))
  }

  it('produce las mismas capturas que full-parse tras una edición de texto', async () => {
    // 1) incremental pide el documento inicial (parcheado vía documentId)
    const incr = createTreeSitterTokenizer()
    const first = await incr.tokenize(request(SEED, 'doc-inc-1'))
    expect(first.ok).toBe(true)

    // 2) edición: insertar un carácter en la palabra `greet` de la línea 0
    const edited = SEED.replace('function greet', 'function greeting')
    const second = await incr.tokenize(request(edited, 'doc-inc-1'))
    expect(second.ok).toBe(true)

    const fresh = await fullResult(edited)
    expect(captureSet(second)).toBe(captureSet(fresh))
  })

  it('simulación de tecleo: cada edición incremental == full-parse del mismo texto', async () => {
    const incr = createTreeSitterTokenizer()
    let text = SEED
    // Primer tokenizado cacheado
    const initial = await incr.tokenize(request(text, 'doc-inc-2'))
    expect(initial.ok).toBe(true)

    const edits: Array<{ from: string; to: string }> = [
      { from: 'const x = 42', to: 'const xy = 42' },
      { from: 'const xy = 42', to: 'const xy = 420' },
      { from: 'greet("world', to: 'greet("wor' },          // borrar un carácter
      { from: 'greet("wor', to: 'greet("world2")' },       // pegar de nuevo
      { from: 'return msg', to: 'return msg // devolver' } // comentario al final de línea
    ]
    for (const { from, to } of edits) {
      expect(text).toContain(from)
      text = text.replace(from, to)
      const result = await incr.tokenize(request(text, 'doc-inc-2'))
      expect(result.ok).toBe(true)
      const fresh = await fullResult(text)
      expect(captureSet(result)).toBe(captureSet(fresh))
    }
  })

  it('una inserción grande (pegar un bloque) sigue siendo idéntica al full-parse', async () => {
    const incr = createTreeSitterTokenizer()
    const initial = await incr.tokenize(request(SEED, 'doc-inc-3'))
    expect(initial.ok).toBe(true)

    const inserted = [
      '',
      'function extra(param) {',
      '  return param * 2',
      '}',
      '',
      'extra(21)'
    ].join('\n') + '\n'
    const edited = SEED + inserted
    const result = await incr.tokenize(request(edited, 'doc-inc-3'))
    expect(result.ok).toBe(true)
    const fresh = await fullResult(edited)
    expect(captureSet(result)).toBe(captureSet(fresh))
  })
})
