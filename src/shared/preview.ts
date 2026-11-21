// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Contrato compartido del esquema de preview (main + renderer). */

export const PREVIEW_SCHEME = 'scrakk-file'

export const PREVIEW_IPC = {
  /** El renderer manda las roots autorizadas (workspace + temp). */
  setRoots: 'preview:set-roots'
} as const
