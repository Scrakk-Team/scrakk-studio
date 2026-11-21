// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/**
 * El editor Innerta como handler de texto.
 *
 * `mode: 'text'` hace que el dispatcher NO monte visor y engancha el motor,
 * que es exactamente el comportamiento histórico. Estar en el registry permite
 * que TODO el contenido de las tabs pase por la misma API global de preview.
 */
const logic: ViewerModule['logic'] = {
  id: 'text',
  match: { matchAll: true },
  mode: 'text',
  priority: -1000,
  fallback: true
}

export default logic
