// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/**
 * Comodín para archivos que NO son texto y no tienen visor específico.
 * No matchea por extensión: el dispatcher lo elige cuando `readEncoded` dice
 * que el contenido es binario (flags `binaryFallback` + resolución explícita).
 */
const logic: ViewerModule['logic'] = {
  id: 'generic',
  match: { scheme: '__preview_generic__' },
  mode: 'view',
  priority: 5,
  binaryFallback: true
}

export default logic
