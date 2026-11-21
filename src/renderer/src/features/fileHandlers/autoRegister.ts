// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Auto-registro de visores por convención de carpeta.
 *
 * Cada `viewers/<id>/` aporta:
 *   - `logic.ts`  → match/mode/priority/actions (EAGER, barato).
 *   - `extra.ts`  → setup previo (worker, URLs, libs) → default export fn (LAZY).
 *   - `ui.tsx`    → componente que se monta en la tab (LAZY).
 *
 * Importar los `logic` eager permite que `fileHandlerRegistry.resolve(path)`
 * siga siendo sincrónico; los módulos pesados (pdfjs, canvas, media) no se
 * cargan hasta que el usuario abre ese tipo de archivo.
 */

import type { ComponentType } from 'react'
import { defineViewer } from './defineViewer'
import { fileHandlerRegistry } from './registry'
import type { FileHandlerViewProps, ViewerModule } from './types'

type LogicModule = { default: ViewerModule['logic'] }
type UiModule = { default: ComponentType<FileHandlerViewProps> }
type ExtraModule = { default?: () => void | Promise<void> }

const logics = import.meta.glob<LogicModule>('./viewers/*/logic.ts', { eager: true })
const uis = import.meta.glob<UiModule>('./viewers/*/ui.tsx')
const extras = import.meta.glob<ExtraModule>('./viewers/*/extra.ts')

function viewerId(path: string): string {
  return /^\.\/viewers\/([^/]+)\//.exec(path)?.[1] ?? ''
}

let registered: (() => void) | null = null

/** Registra TODOS los visores de `viewers/`. Idempotente. Devuelve la baja. */
export function registerViewers(): () => void {
  if (registered) return registered

  const unsubs: Array<() => void> = []
  for (const [logicPath, loaded] of Object.entries(logics)) {
    const id = viewerId(logicPath)
    const logic = loaded?.default
    if (!id || !logic) continue

    const uiPath = `./viewers/${id}/ui.tsx`
    const extraPath = `./viewers/${id}/extra.ts`
    const ui = uis[uiPath]
    // Sin `ui` no hay nada que montar en la tab: se ignora la carpeta.
    if (!ui) continue

    const extraLoader = extras[extraPath]
    const extra = extraLoader
      ? async (): Promise<void> => {
          const mod = await extraLoader()
          await mod.default?.()
        }
      : undefined

    const handler = defineViewer({
      logic,
      extra,
      ui: ui as ViewerModule['ui']
    })
    unsubs.push(fileHandlerRegistry.register(handler))
  }

  registered = (): void => {
    while (unsubs.length) unsubs.pop()?.()
    registered = null
  }
  return registered
}
