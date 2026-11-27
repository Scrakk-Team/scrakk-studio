// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Cambiar de sesión ya preparada NO debe repetir el chrome del editor. */

import { describe, expect, it, vi } from 'vitest'

const { InnertaEngine } = await import('../src/renderer/src/features/editor/engines/innerta/InnertaEngine')

function engineWithModule(): { engine: any; activateSession: ReturnType<typeof vi.fn> } {
  const engine = new InnertaEngine({ isolated: true }) as any
  const activateSession = vi.fn()
  engine.module = { activateSession }
  engine.bridge = { setPath: vi.fn(), syncCursor: vi.fn() }
  return { engine, activateSession }
}

describe('activateFileSession', () => {
  it('usa el fast path si la sesión ya está preparada', () => {
    const { engine, activateSession } = engineWithModule()
    engine.preparedSessions.add('/r/b.ts')
    const full = vi.spyOn(engine, 'activatePath')
    const fast = vi.spyOn(engine, 'activatePreparedSession').mockImplementation(() => undefined)

    engine.activateFileSession('/r/b.ts')

    expect(activateSession).toHaveBeenCalledWith('/r/b.ts')
    expect(fast).toHaveBeenCalledWith('/r/b.ts')
    expect(full).not.toHaveBeenCalled()
  })

  it('la primera activación sí pasa por el chrome completo', () => {
    const { engine, activateSession } = engineWithModule()
    engine.module.getSessionText = vi.fn(() => 'contenido')
    const full = vi.spyOn(engine, 'activatePath').mockImplementation(() => undefined)

    engine.activateFileSession('/r/new.ts')

    expect(activateSession).toHaveBeenCalledWith('/r/new.ts')
    expect(full).toHaveBeenCalledWith('/r/new.ts', 'contenido')
  })

  it('no hace nada si ya es la activa', () => {
    const { engine, activateSession } = engineWithModule()
    engine.currentPath = '/r/a.ts'
    engine.activateFileSession('/r/a.ts')
    expect(activateSession).not.toHaveBeenCalled()
  })
})
