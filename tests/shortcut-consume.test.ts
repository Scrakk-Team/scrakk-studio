// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Un atajo consumido en CAPTURA no debe llegar al editor. */

import { describe, expect, it, vi } from 'vitest'

const handlers: Array<(event: unknown) => void> = []
let captured = false
vi.stubGlobal('window', {
  addEventListener: (type: string, fn: (event: unknown) => void, capture?: boolean): void => {
    if (type === 'keydown') {
      handlers.push(fn)
      captured = capture === true
    }
  },
  removeEventListener: (): void => undefined
})

const { shortcuts, isShortcutConsumed } = await import(
  '../src/renderer/src/services/shortcuts'
)

function keyEvent(): any {
  return {
    key: 'Tab',
    code: 'Tab',
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    target: null,
    preventDefault: vi.fn()
  }
}

describe('consumo de atajos', () => {
  it('el listener va en fase CAPTURA (antes del canvas del editor)', () => {
    const off = shortcuts.register({
      id: 'test.tab.next', combo: 'mod+tab', handler: vi.fn(), preventDefault: true
    })
    expect(captured).toBe(true)
    off()
  })

  it('marca el evento como consumido y aplica preventDefault', () => {
    const handler = vi.fn()
    const off = shortcuts.register({
      id: 'test.tab.next', combo: 'mod+tab', handler, preventDefault: true
    })
    const event = keyEvent()
    for (const fn of handlers) fn(event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(isShortcutConsumed(event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    off()
  })

  it('una tecla sin atajo NO queda consumida', () => {
    const event = { ...keyEvent(), ctrlKey: false }
    for (const fn of handlers) fn(event)
    expect(isShortcutConsumed(event)).toBe(false)
  })
})
