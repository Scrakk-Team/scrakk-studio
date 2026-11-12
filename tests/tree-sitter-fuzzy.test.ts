// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Equivalencia incremental ↔ full-parse, fuzz sobre typing.py.
 *
 * El archivo grande de la stdlib de Python es el peor caso para el motor
 * (gramática pesada, árboles grandes, muchos patrones). Aplica N ediciones
 * pequeñas (inserción/borrado/reemplazo en posiciones pseudo-aleatorias y
 * reproducibles) y exige, TRAS CADA EDICIÓN, tokens + datos idénticos entre
 * el camino incremental y full-parse del mismo texto. Si el merge se equivoca
 * esto lo destapa.
 */
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DynamicTokenizeRequest } from '../src/shared/extensions'

const parserSource = process.env['SCRAKK_PYTHON_PARSER']
const root = mkdtempSync(join(tmpdir(), 'scrakk-fuzzypy-'))
mkdirSync(join(root, 'grammars'), { recursive: true })
mkdirSync(join(root, 'queries'), { recursive: true })

const { createTreeSitterTokenizer } = await import('../src/main/extensions/treeSitter/tokenizer')

const QY = [
  { file: join(root, 'queries', 'highlights.scm'), category: 'highlights' as const },
  { file: join(root, 'queries', 'locals.scm'), category: 'locals' as const },
  { file: join(root, 'queries', 'tags.scm'), category: 'tags' as const },
  { file: join(root, 'queries', 'folds.scm'), category: 'folds' as const }
]

const text = readFileSync(
  process.env['SCRAKK_PYTHON_SAMPLE'] ??
    '/home/julian/Documentos/Proyectos/InnertaEngine/InnertaEngine-Linux/build-linux/typing.py',
  'utf8'
)
const initial = text.slice(0, 20000) // recortar para velocidad

function request(t: string, documentId?: string): DynamicTokenizeRequest {
  return {
    languageId: 'python',
    parserPath: join(root, 'grammars', 'python.wasm'),
    queries: QY,
    embedded: [],
    ...(documentId ? { documentId } : {}),
    text: t
  }
}

function captureSet(result: {
  tokens: Array<{ line: number; start: number; end: number; scopes: number }>
  scopeSets: string[][]
}): string {
  const byToken = new Map<string, string>()
  for (const token of result.tokens) {
    const scopes = result.scopeSets[token.scopes] ?? []
    byToken.set(`${token.line}:${token.start}:${token.end}`, [...scopes].sort().join(','))
  }
  return [...byToken.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k} → ${v}`)
    .join('\n')
}

function foldKey(data: { folds: Array<{ startLine: number; endLine: number; kind: string }> | undefined } | undefined): string {
  if (!data) return 'no-folds'
  return [...(data.folds ?? [])].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine).map((f) => `${f.startLine}-${f.endLine}:${f.kind}`).join('|')
}

describe.skipIf(!parserSource)('incremental ↔ full-parse en typing.py (fuzz)', () => {
  beforeAll(() => {
    if (parserSource) copyFileSync(parserSource, join(root, 'grammars', 'python.wasm'))
    const langsRoot = join(process.cwd(), 'langs/python/queries')
    for (const name of ['highlights', 'locals', 'tags', 'folds']) {
      copyFileSync(join(langsRoot, `${name}.scm`), join(root, 'queries', `${name}.scm`))
    }
  })

  afterAll(() => {
    /* tmp */
  })

  it('N ediciones incrementales == full-parse, token por token', async () => {
    const incr = createTreeSitterTokenizer()
    let current = initial
    const first = await incr.tokenize(request(current, 'fuzz-doc'))
    expect(first.ok).toBe(true)

    // PRNG determinista (test reproducible)
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const alphabet = 'aeiou_ \nxy42()\'"'
    const edits = 24
    for (let step = 0; step < edits; step++) {
      // posición pseudo-aleatoria en el texto actual
      const pos = Math.floor(rand() * Math.max(1, current.length - 2))
      const op = rand() < 0.6 ? 'insert' : rand() < 0.5 ? 'delete' : 'replace'
      let edited: string
      if (op === 'insert') {
        const ch = alphabet[Math.floor(rand() * alphabet.length)]
        edited = current.slice(0, pos) + ch + current.slice(pos)
      } else if (op === 'delete') {
        edited = current.slice(0, pos) + current.slice(pos + 1)
      } else {
        const ch = alphabet[Math.floor(rand() * alphabet.length)]
        edited = current.slice(0, pos) + ch + current.slice(pos + 1)
      }
      current = edited
      const result = await incr.tokenize(request(current, 'fuzz-doc'))
      expect(result.ok).toBe(true)

      const fresh = createTreeSitterTokenizer()
      const full = await fresh.tokenize(request(current))
      expect(full.ok).toBe(true)

      expect(captureSet(result)).toBe(captureSet(full))
      expect(foldKey(result.data as never)).toBe(foldKey(full.data as never))
      console.log(`step ${step}: ${op} @${pos} → ok (tokens ${result.tokens.length})`)
    }
  }, 300000)
})
