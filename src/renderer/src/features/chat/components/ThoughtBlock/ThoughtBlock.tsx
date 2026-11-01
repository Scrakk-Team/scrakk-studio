// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import { ProductIcon } from '@services/productIcons/components'
import { memo, useEffect, useRef, useState, type JSX } from 'react'
import { ThinkingState } from '../ThinkingState/ThinkingState'
import styles from './ThoughtBlock.module.css'

import { t } from '@core/i18n'
interface ThoughtBlockProps {
  /** Razonamiento acumulado del modelo. */
  reasoning: string
  /** true mientras el modelo sigue pensando (stream abierto). */
  thinking: boolean
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/** Tope de oraciones en el DOM: el viewport mide ~180px, no hace falta más. */
const MAX_SENTENCES = 40

export interface IncrementalSentences {
  /** Texto acumulado ya procesado (para calcular solo el delta nuevo). */
  source: string
  /** Oraciones cerradas (solo las últimas MAX_SENTENCES). */
  sentences: string[]
  /** Frase que todavía no terminó. */
  tail: string
}

/**
 * Segmentación incremental: no vuelve a partir todo el razonamiento en cada
 * frame. Solo procesa `tail + texto nuevo`, y el estado anterior no se toca.
 */
export function appendReasoning(
  previous: IncrementalSentences,
  reasoning: string
): IncrementalSentences {
  if (!reasoning.startsWith(previous.source)) {
    return appendReasoning({ source: '', sentences: [], tail: '' }, reasoning)
  }
  const delta = reasoning.slice(previous.source.length)
  if (!delta) return previous

  const combined = previous.tail + delta
  const parts = splitSentences(combined)
  const endsSentence = /[.!?…]\s*$|\n\s*$/.test(combined)
  let tail = ''
  if (!endsSentence && parts.length > 0) tail = parts.pop() ?? ''
  return {
    source: reasoning,
    sentences: [...previous.sentences, ...parts].slice(-MAX_SENTENCES),
    tail
  }
}

/**
 * Bloque de razonamiento estilo "Thought": mientras piensa el header es el
 * indicador "Thinking" (orb + shimmer) dentro del propio bloque; cuando
 * termina de pensar el header muestra "Thought for Ns" con el tiempo real.
 * Viewport con auto-scroll mientras piensa y oraciones con fade-in.
 */
export const ThoughtBlock = memo(function ThoughtBlock({ reasoning, thinking }: ThoughtBlockProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const sentencesRef = useRef<IncrementalSentences>({ source: '', sentences: [], tail: '' })

  // Contador de "Thought for Ns" mientras piensa.
  useEffect(() => {
    if (!thinking) return
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [thinking])

  // Mientras piensa, el stream queda anclado al fondo. ResizeObserver se
  // dispara solo cuando el contenido crece: nada de leer scrollHeight por
  // cada token.
  useEffect(() => {
    const viewport = viewportRef.current
    const stream = streamRef.current
    if (!viewport || !stream || !thinking) return undefined
    const observer = new ResizeObserver(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
    observer.observe(stream)
    return () => observer.disconnect()
  }, [thinking])

  // Abierto mientras piensa; al terminar se pliega (el usuario lo despliega).
  const isExpanded = expanded || thinking
  const next = reasoning === sentencesRef.current.source
    ? sentencesRef.current
    : appendReasoning(sentencesRef.current, reasoning)
  sentencesRef.current = next
  const sentences = next.sentences
  const tail = next.tail

  return (
    <div className={styles.tr}>
      <button
        type="button"
        className={styles.trHeader}
        aria-expanded={isExpanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {thinking ? (
          <ThinkingState />
        ) : (
          <span className={styles.trLabel}>{t('chat.thought.for')} {seconds}s</span>
        )}
        <ProductIcon id="chevron-down" size={14} className={styles.trChevron} aria-hidden="true" />
      </button>

      <div className={`${styles.trCollapsible} ${isExpanded ? '' : styles.isCollapsed}`}>
        <div className={styles.trInner}>
          <div
            ref={viewportRef}
            className={`${styles.trViewport} ${thinking ? styles.isScroll : ''}`}
          >
            <div ref={streamRef} className={styles.trStream}>
              {sentences.map((sentence, index) => (
                <p key={index} className={styles.trSentence}>
                  {sentence}
                </p>
              ))}
              {tail ? (
                <p className={styles.trSentence}>{tail}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
