// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** PDF: pieza pura, se renderiza a canvas con pdfjs. */
const logic: ViewerModule['logic'] = {
  id: 'pdf',
  match: { extensions: ['pdf'] },
  mode: 'view',
  priority: 40,
  actions: []
}

export default logic
