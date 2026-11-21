// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** Imágenes: pieza pura. El editor no tiene sentido, así que no hay ojo. */
const logic: ViewerModule['logic'] = {
  id: 'image',
  match: { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'] },
  mode: 'view',
  priority: 30
}

export default logic
