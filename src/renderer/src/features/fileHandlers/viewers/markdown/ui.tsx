// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { JSX } from 'react'
import { Markdown } from '@features/chat/components/Markdown/Markdown'
import type { FileHandlerViewProps } from '../../types'
import styles from '../../viewers.module.css'

/** Visor de markdown: mismo render que el chat (Prism incluido). */
export default function MarkdownViewer({ content }: FileHandlerViewProps): JSX.Element {
  return (
    <div className={styles.view}>
      <div className={styles.doc}>
        <Markdown content={content ?? ''} />
      </div>
    </div>
  )
}
