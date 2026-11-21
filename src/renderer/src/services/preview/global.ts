// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Expone la API de preview en `window.scrakk.preview` para bundles .sef.
 * Se llama UNA vez desde main.tsx, antes de bootExtensions().
 */

import type { PreviewApi } from './types'

/** Se instala sobre el `window.scrakk` que ya declara main.tsx. */
export function installPreviewGlobal(api: PreviewApi): void {
  if (typeof window === 'undefined') return
  const host = window as unknown as { scrakk?: { preview?: PreviewApi } }
  host.scrakk ??= {}
  host.scrakk.preview = api
}
