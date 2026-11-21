// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** Datos en memoria abiertos por `preview.openBytes` (scrakk-view://bytes/…). */
const logic: ViewerModule['logic'] = {
  id: 'bytes',
  match: { scheme: 'scrakk-view' },
  mode: 'view',
  priority: 50
}

export default logic
