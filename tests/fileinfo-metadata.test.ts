// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Helpers puros del panel de información de archivo. */

import { describe, expect, it } from 'vitest'
import { formatSize, formatModified } from '../src/renderer/src/features/tooldock/items/fileinfo/metadata'

describe('fileinfo metadata helpers', () => {
  it('formatea tamaños legibles', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(null)).toBeNull()
  })

  it('formatea la fecha de modificación o devuelve null', () => {
    expect(formatModified(null)).toBeNull()
    expect(formatModified(Number.NaN)).toBeNull()
    const formatted = formatModified(Date.UTC(2026, 0, 2, 3, 4, 5))
    expect(typeof formatted).toBe('string')
    expect(formatted!.length).toBeGreaterThan(0)
  })
})
