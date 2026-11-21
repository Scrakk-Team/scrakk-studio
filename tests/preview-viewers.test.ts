// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El sistema de preview es UNA API: los visores se descubren por convención de
 * carpeta y el editor entra como handler de texto (fallback). Estos tests
 * verifican las decisiones que romperían la resolución en las tabs.
 */

import { describe, expect, it } from 'vitest'
import { fileHandlerRegistry } from '../src/renderer/src/features/fileHandlers/registry'
import { effectiveMode } from '../src/renderer/src/features/fileHandlers/preferences'
import { pickHandler } from '../src/renderer/src/features/fileHandlers/detect'

const handlers = [
  { id: 'image', match: { extensions: ['png'] }, mode: 'view' as const, priority: 30 },
  { id: 'pdf', match: { extensions: ['pdf'] }, mode: 'view' as const, priority: 40 },
  { id: 'audio', match: { extensions: ['mp3'] }, mode: 'view' as const, priority: 25 },
  { id: 'text', match: { matchAll: true }, mode: 'text' as const, priority: -1000, fallback: true },
  { id: 'generic', match: { scheme: '__preview_generic__' }, mode: 'view' as const, priority: 5, binaryFallback: true }
]

describe('preview viewer resolution', () => {
  it('elige el visor específico antes que el texto para formatos conocidos', () => {
    expect(pickHandler(handlers, '/repo/doc.pdf')?.id).toBe('pdf')
    expect(pickHandler(handlers, '/repo/pic.png')?.id).toBe('image')
    expect(pickHandler(handlers, '/repo/song.mp3')?.id).toBe('audio')
  })

  it('el texto es fallback: gana en archivos sin visor', () => {
    expect(pickHandler(handlers, '/repo/main.ts')?.id).toBe('text')
    expect(effectiveMode(pickHandler(handlers, '/repo/main.ts'), '/repo/main.ts')).toBe('text')
  })

  it('un handler own:view no pierde ante el fallback de texto', () => {
    const h = pickHandler(handlers, '/repo/movie.unknown')
    expect(h?.id).toBe('text')
    expect(effectiveMode(h, '/repo/movie.unknown')).toBe('text')
  })

  it('el comodón binario NO se elige por patrón (sólo el dispatcher lo pide)', () => {
    expect(pickHandler(handlers, '/repo/data.unknown')?.id).not.toBe('generic')
  })

  it('el registry expone register/resolve/list (API global de extensiones)', () => {
    const un = fileHandlerRegistry.register({ id: 'ext-test', match: { extensions: ['zzz'] }, mode: 'view' })
    expect(fileHandlerRegistry.resolve('/x/file.zzz')?.id).toBe('ext-test')
    expect(fileHandlerRegistry.list().some((h) => h.id === 'ext-test')).toBe(true)
    un()
    expect(fileHandlerRegistry.resolve('/x/file.zzz')).toBeNull()
  })
})
