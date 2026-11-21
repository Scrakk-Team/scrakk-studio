// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'
import styles from '../../viewers.module.css'

/** `btoa` sólo acepta latin1: se codifican los bytes UTF-8 a mano. */
function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export default function SvgViewer({ content }: FileHandlerViewProps): JSX.Element {
  return (
    <div className={styles.view}>
      <div className={styles.center}>
        <img src={svgDataUrl(content ?? '')} alt="" />
      </div>
    </div>
  )
}
