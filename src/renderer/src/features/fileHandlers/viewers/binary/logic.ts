// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ViewerModule } from '../../types'

/** Ejecutables y binarios: hoy placeholder, mañana visor de ELF/PE. */
const logic: ViewerModule['logic'] = {
  id: 'binary',
  match: {
    extensions: [
      'exe', 'dll', 'so', 'dylib', 'elf', 'o', 'obj', 'a', 'lib', 'bin',
      'appimage', 'deb', 'rpm', 'msi', 'wasm', 'class', 'pyc'
    ]
  },
  mode: 'view',
  priority: 15
}

export default logic
