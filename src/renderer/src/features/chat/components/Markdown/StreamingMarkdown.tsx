// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Markdown incremental del stream.
 *
 * El problema de renderizar `react-markdown` sobre el mensaje completo en cada
 * frame es que el costo crece con TODO el texto ya escrito (parse + Prism de
 * todos los code blocks). Acá se corta el texto en bloques estables separados
 * por una línea vacía FUERA de un fence, y solo el último tramo (el que todavía
 * está creciendo) se vuelve a parsear. Los bloques anteriores quedan
 * memoizados por su string.
 *
 * No hay timer ni polling: el último tramo se actualiza en el mismo render del
 * stream.
 */

import { memo, useMemo, type JSX } from 'react'
import { MarkdownContent } from './Markdown'
import styles from './Markdown.module.css'

export interface StableMarkdown {
  /** Bloques cerrados, en orden. */
  blocks: string[]
  /** Tramo que sigue creciendo. */
  tail: string
}

function fenceOf(line: string): { char: string; length: number } | null {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
  if (!match) return null
  return { char: match[1][0], length: match[1].length }
}

function closesFence(line: string, fence: { char: string; length: number }): boolean {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)
  return Boolean(match && match[1][0] === fence.char && match[1].length >= fence.length)
}

function splitBlocks(source: string): string[] {
  const blocks: string[] = []
  let fence: { char: string; length: number } | null = null
  let current: string[] = []

  const push = (): void => {
    const block = current.join('\n').trim()
    if (block) blocks.push(block)
    current = []
  }

  for (const line of source.split('\n')) {
    if (fence) {
      current.push(line)
      if (closesFence(line, fence)) fence = null
      continue
    }
    const opening = fenceOf(line)
    if (opening) {
      fence = opening
      current.push(line)
      continue
    }
    if (line.trim() === '') {
      push()
      continue
    }
    current.push(line)
  }
  push()
  return blocks
}

/**
 * Separa bloques cerrados del tramo vivo. Un bloque cierra cuando aparece una
 * línea vacía fuera de un fence; el texto posterior a la última queda como
 * `tail`.
 */
export function splitStableMarkdown(source: string): StableMarkdown {
  if (!source) return { blocks: [], tail: '' }
  const lines = source.split('\n')
  let fence: { char: string; length: number } | null = null
  let lastBoundary = -1
  let offset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (fence) {
      if (closesFence(line, fence)) fence = null
    } else {
      const opening = fenceOf(line)
      if (opening) {
        fence = opening
      } else if (line.trim() === '' && index > 0) {
        lastBoundary = offset
      }
    }
    offset += line.length + 1
  }

  if (lastBoundary < 0) return { blocks: [], tail: source }

  const stable = source.slice(0, lastBoundary)
  const tail = source.slice(lastBoundary).replace(/^\n+/, '')
  return { blocks: splitBlocks(stable), tail }
}

/**
 * Render incremental mientras la respuesta está en curso. Al terminar el
 * mensaje, el llamador usa `<Markdown>` normal sobre el contenido completo.
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content
}: {
  content: string
}): JSX.Element {
  const { blocks, tail } = useMemo(() => splitStableMarkdown(content), [content])
  return (
    <div className={styles.md}>
      {blocks.map((block, index) => (
        <MarkdownContent key={index} content={block} />
      ))}
      {tail ? <div className={styles.streamTail}>{tail}</div> : null}
    </div>
  )
})
