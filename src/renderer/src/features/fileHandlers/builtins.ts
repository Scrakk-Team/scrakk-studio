// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Registro de los visores FIRST-PARTY.
 *
 * Los visores viven en `viewers/<id>/{logic,extra,ui}` y se descubren por
 * convención (ver `autoRegister.ts`). Agregar un formato = crear una carpeta;
 * no hay lista que mantener acá.
 */

import { registerViewers } from './autoRegister'

let unregister: (() => void) | null = null

/** Registra los visores built-in (idempotente). */
export function registerBuiltinFileHandlers(): void {
  unregister ??= registerViewers()
}
