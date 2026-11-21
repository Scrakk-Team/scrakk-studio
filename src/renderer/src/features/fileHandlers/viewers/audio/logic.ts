// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** Audio: pieza pura, reproductor nativo con controles. */
const logic: ViewerModule['logic'] = {
  id: 'audio',
  match: { extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'webm'] },
  mode: 'view',
  priority: 25
}

export default logic
