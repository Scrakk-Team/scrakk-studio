// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * defineViewer — arma un `FileHandler` a partir de los 3 archivos de una
 * carpeta de visor (`logic.ts` / `extra.ts` / `ui.tsx`).
 *
 * `logic` se importa EAGER (para que `resolve()` sea sincrónico); `extra` y
 * `ui` se importan LAZY y se ejecutan en ese orden cuando el archivo se abre.
 * Así, agregar un visor = crear una carpeta con esos archivos, sin tocar el
 * registry ni el dispatcher.
 */

import type { FileHandler, ViewerModule } from './types'

export function defineViewer(mod: ViewerModule): FileHandler {
  return {
    ...mod.logic,
    load: async () => {
      if (mod.extra) await mod.extra()
      return mod.ui()
    }
  }
}
