// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** Markdown: caso intermedio — renderizado o texto (el ojo alterna). */
const logic: ViewerModule['logic'] = {
  id: 'markdown',
  match: { extensions: ['md', 'markdown', 'mdown', 'mkd'] },
  mode: 'both',
  priority: 10
}

export default logic
