// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * El preview de tools de lectura no puede arrastrar el archivo completo al
 * estado de React ni a la persistencia del chat.
 */

import { describe, expect, it } from 'vitest'
import { previewToolResult } from '../src/renderer/src/services/chat/toolResultPreview'

describe('previewToolResult', () => {
  it('read_file conserva metadata y recorta el contenido', () => {
    const full = 'x'.repeat(5000)
    const input = JSON.stringify({
      path: 'src/a.ts',
      content: full,
      total_lines: 100,
      original_line_ending: 'lf',
      had_bom: false,
      normalization_warnings: []
    })
    const parsed = JSON.parse(previewToolResult('read_file', input)) as Record<string, unknown>
    expect(parsed.path).toBe('src/a.ts')
    expect(parsed.total_lines).toBe(100)
    expect(parsed.preview).toBe('x'.repeat(2048))
    expect(parsed.preview_truncated).toBe(true)
    expect(parsed).not.toHaveProperty('content')
    expect(JSON.stringify(parsed).length).toBeLessThan(full.length)
  })

  it('read_multiple_files devuelve resumen por archivo, sin contenido completo', () => {
    const input = JSON.stringify({
      'a.ts': { success: true, content: 'a'.repeat(2000) },
      'b.ts': { success: false, error: 'missing' }
    })
    const parsed = JSON.parse(previewToolResult('read_multiple_files', input)) as {
      files: Array<Record<string, unknown>>
    }
    expect(parsed.files).toHaveLength(2)
    expect(parsed.files[0]).toMatchObject({
      path: 'a.ts',
      success: true,
      bytes: 2000,
      preview_truncated: true
    })
    expect(parsed.files[0]).not.toHaveProperty('content')
    expect(parsed.files[1]).toMatchObject({ path: 'b.ts', success: false, error: 'missing' })
  })

  it('otras tools pasan intactas', () => {
    expect(previewToolResult('grep_search', '{"matches":[]}')).toBe('{"matches":[]}')
  })

  it('multiple_tools recorta el volcado anidado', () => {
    const huge = 'x'.repeat(10_000)
    const preview = previewToolResult('multiple_tools', huge)
    expect(preview.length).toBeLessThan(huge.length)
    expect(preview).toContain('[truncated]')
  })

  it('JSON inválido no rompe: cae al texto original', () => {
    expect(previewToolResult('read_file', 'not-json')).toBe('not-json')
  })
})
