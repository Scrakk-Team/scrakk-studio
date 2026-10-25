// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import styles from './ChatUsage.module.css'

interface ChatUsageRingProps {
  /** 0..100. */
  percent: number
  /** Diámetro en px (default 18). */
  size?: number
  /** Grosor del trazo (default 2). */
  stroke?: number
}

/**
 * Anillo de progreso del contexto: se va llenando a medida que el chat
 * consume tokens. SVG puro (sin librerías) y con `stroke-dashoffset`.
 */
export function ChatUsageRing({ percent, size = 18, stroke = 2 }: ChatUsageRingProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const high = clamped >= 90
  return (
    <svg
      className={styles.ring}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        className={styles.track}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
      />
      <circle
        className={[styles.progress, high ? styles.progressHigh : null].filter(Boolean).join(' ')}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
