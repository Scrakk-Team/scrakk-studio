// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** SVG: se ve como imagen o se edita como texto (es XML). */
const logic: ViewerModule['logic'] = {
  id: 'svg',
  match: { extensions: ['svg'] },
  mode: 'both',
  priority: 20
}

export default logic
