// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El "visor" del editor es un no-op: `mode:'text'` hace que el dispatcher
 * engancha el motor Innerta en vez de montar este componente. Existe para que
 * la convención de carpeta `{logic,extra,ui}` sea uniforme.
 */

import type { JSX } from 'react'
import type { FileHandlerViewProps } from '../../types'

export default function TextEditorSlot(_props: FileHandlerViewProps): JSX.Element {
  return <></>
}
