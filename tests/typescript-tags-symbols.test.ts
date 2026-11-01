// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Las queries `tags.scm` de TypeScript/TSX tienen que producir los símbolos
 * que usa el breadcrumb. Helix hereda la base de ecma; este pack no, así que
 * las declaraciones normales se perdían y el AST quedaba sin outline.
 *
 * Este test compila la query real contra el parser real (el mismo runtime
 * `web-tree-sitter` del worker), no contra capturas escritas a mano.
 */

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { Language, Parser, Query } from 'web-tree-sitter'

const root = new URL('../', import.meta.url)

function read(relative: string): string {
  return readFileSync(new URL(relative, root), 'utf8')
}

interface RealGrammar {
  parser: Parser
  query: Query
}

async function loadGrammar(grammar: string, query: string): Promise<RealGrammar> {
  const parser = new Parser()
  const language = await Language.load(new URL(grammar, root).pathname)
  parser.setLanguage(language)
  return { parser, query: new Query(language, read(query)) }
}

function definitions(grammar: RealGrammar, source: string): string[] {
  return grammar.query
    .captures(grammar.parser.parse(source).rootNode)
    .filter((capture) => capture.name.startsWith('definition.'))
    .map((capture) => capture.name)
}

describe('tags.scm de TypeScript', () => {
  let ts: RealGrammar
  beforeAll(async () => {
    await Parser.init()
    ts = await loadGrammar(
      'langs/typescript/grammars/typescript.wasm',
      'langs/typescript/queries/tags.scm'
    )
  })

  it('produce clases, métodos, funciones, arrows, enums y types', () => {
    const found = definitions(
      ts,
      `
      export class Foo {
        prop: number = 1
        constructor() {}
        render(x: number) { return x }
      }
      export function bar() {}
      export const f = (x: number) => x + 1
      export enum E { A }
      export type T = { a: string }
      `
    )
    expect(found).toContain('definition.class')
    expect(found).toContain('definition.method')
    expect(found).toContain('definition.function')
    expect(found).toContain('definition.enum')
    expect(found).toContain('definition.type')
  })
})

describe('tags.scm de TSX', () => {
  it('produce el componente y el método aunque haya JSX', async () => {
    const tsx = await loadGrammar(
      'langs/tsx/grammars/tsx.wasm',
      'langs/tsx/queries/tags.scm'
    )
    const found = definitions(
      tsx,
      'export class Foo { render() { return <div /> } }\nexport const App = () => <div />\n'
    )
    expect(found).toContain('definition.class')
    expect(found).toContain('definition.method')
    expect(found).toContain('definition.function')
  })
})
