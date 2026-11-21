// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Capa de datos para los visores.
 *
 * Todos los visores leen el archivo por acá, nunca directo por IPC. Así el
 * día que un formato pase a streaming (`scrakk-file://`) el cambio es acá y
 * no en cada visor.
 */

import { api } from '@services/api'
import type { ReadBinaryResponse } from '@shared/fs'

/** Lectura binaria (base64 + mime). Para archivos chicos; streaming va aparte. */
export async function readPreviewBinary(path: string): Promise<ReadBinaryResponse> {
  const readBinary = api?.fs?.readBinary
  if (typeof readBinary !== 'function') {
    return {
      success: false,
      error: 'Falta el puente fs.readBinary: hay que reiniciar la app (no alcanza con recargar).'
    }
  }
  return readBinary(path)
}
