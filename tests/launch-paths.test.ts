// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Cola de rutas abiertas desde el explorador del SO: la misma ruta puede
 * llegar por push (segunda instancia) y por pull (arranque en frío). No debe
 * abrirse dos veces.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

let pushListener: ((payload: { paths: Array<{ path: string; isDirectory: boolean }> }) => void) | null = null
const takeOpenPaths = vi.fn(async () => ({ paths: [] as Array<{ path: string; isDirectory: boolean }> }))

vi.mock('@services/api', () => ({
  api: {
    app: {
      onOpenPaths: (listener: typeof pushListener) => {
        pushListener = listener
        return () => { pushListener = null }
      },
      takeOpenPaths: () => takeOpenPaths()
    }
  }
}))

const {
  initLaunchPaths,
  subscribeLaunchPaths,
  _resetLaunchPathsForTests
} = await import('../src/renderer/src/services/launchPaths')

beforeEach(() => {
  _resetLaunchPathsForTests()
  pushListener = null
  takeOpenPaths.mockReset()
  takeOpenPaths.mockResolvedValue({ paths: [] })
})

describe('launchPaths', () => {
  it('entrega cada ruta una sola vez aunque llegue por push y por pull', async () => {
    initLaunchPaths()
    const received: string[] = []
    const unsubscribe = subscribeLaunchPaths((paths) => {
      received.push(...paths.map((entry) => entry.path))
    })

    const file = { path: '/repo/app.ts', isDirectory: false }
    pushListener?.({ paths: [file] })
    // El arranque en frío reclama la misma cola que ya se empujó.
    takeOpenPaths.mockResolvedValueOnce({ paths: [file] })
    await Promise.resolve()

    expect(received).toEqual(['/repo/app.ts'])
    unsubscribe()
  })

  it('el pull del arranque entrega rutas aunque no haya llegado ningún push', async () => {
    const folder = { path: '/repo/src', isDirectory: true }
    takeOpenPaths.mockResolvedValueOnce({ paths: [folder] })
    initLaunchPaths()
    const received: Array<{ path: string; isDirectory: boolean }> = []
    const unsubscribe = subscribeLaunchPaths((paths) => received.push(...paths))

    await Promise.resolve()
    await Promise.resolve()

    expect(received).toEqual([folder])
    unsubscribe()
  })
})
