// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El esquema de streaming debe servir SOLO rutas autorizadas. Sin el jail, un
 * <img src="scrakk-file://…"> podría leer cualquier archivo del usuario.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (req: { url: string }, cb: (r: { path?: string; error?: number }) => void) => void> = {}
const schemeCalls: unknown[] = []

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/scrakk-test' },
  ipcMain: { handle: vi.fn() },
  session: {
    defaultSession: {
      protocol: {
        registerFileProtocol: (scheme: string, fn: typeof handlers[string]) => {
          handlers[scheme] = fn
        }
      }
    }
  },
  protocol: {
    registerSchemesAsPrivileged: (opts: unknown) => schemeCalls.push(opts)
  }
}))

const { registerPreviewScheme, registerPreviewProtocol, _resetPreviewRootsForTests } = await import('../src/main/previewProtocol')
const { PREVIEW_IPC } = await import('../src/shared/preview')

function request(url: string): { path?: string; error?: number } {
  let result: { path?: string; error?: number } = {}
  handlers['scrakk-file']?.({ url }, (r) => { result = r })
  return result
}

beforeEach(() => {
  _resetPreviewRootsForTests()
})

describe('previewProtocol', () => {
  it('registra el esquema antes de ready', () => {
    registerPreviewScheme()
    expect(schemeCalls.length).toBeGreaterThan(0)
    expect(JSON.stringify(schemeCalls[0])).toContain('scrakk-file')
  })

  it('sirve archivos dentro de las roots y rechaza los de fuera', async () => {
    registerPreviewProtocol()
    const { ipcMain } = await import('electron')
    const setRoots = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === PREVIEW_IPC.setRoots)?.[1]
    expect(setRoots).toBeDefined()
    setRoots?.({} as never, { roots: ['/workspace'] })

    const urlFor = (p: string) => `scrakk-file://preview/${encodeURIComponent(p)}`
    expect(request(urlFor('/workspace/src/app.ts')).path).toBe('/workspace/src/app.ts')
    expect(request(urlFor('/etc/passwd')).error).toBe(-3)
    expect(request('not-a-url').error).toBe(-3)
  })
})
