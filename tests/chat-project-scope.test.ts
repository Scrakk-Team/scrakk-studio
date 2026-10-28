// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tests del alcance por proyecto del historial de chats y de la identidad
 * leída de `<root>/.scrakk/history/id.json`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  writeJson: vi.fn()
}))

vi.mock('@services/api', () => ({
  api: {
    scrakk: {
      read: mocks.read,
      writeJson: mocks.writeJson
    }
  }
}))

import {
  NO_PROJECT_ID,
  _resetProjectIdsForTests,
  ensureProjectId,
  parseProjectId
} from '../src/renderer/src/services/workspaces/projectId'
import {
  filterSessionsByProject,
  migrateLegacySessions
} from '../src/renderer/src/services/workspaces/chatScope'

interface TestSession {
  id: string
  projectId?: string
}

describe('projectId — formato de .scrakk/history/id.json', () => {
  it('acepta el objeto que escribe el editor', () => {
    expect(parseProjectId('{"id":"abc-123","createdAt":"2026-01-01"}')).toBe('abc-123')
  })

  it('acepta JSON string y texto plano', () => {
    expect(parseProjectId('"abc-123"')).toBe('abc-123')
    expect(parseProjectId('  abc-123\n')).toBe('abc-123')
  })

  it('rechaza vacíos, ids no string y JSON roto', () => {
    expect(parseProjectId(null)).toBeNull()
    expect(parseProjectId('')).toBeNull()
    expect(parseProjectId('{"id":42}')).toBeNull()
    expect(parseProjectId('{"id":""}')).toBeNull()
    expect(parseProjectId('{roto')).toBeNull()
  })
})

describe('projectId — ensureProjectId', () => {
  beforeEach(() => {
    _resetProjectIdsForTests()
    mocks.read.mockReset()
    mocks.writeJson.mockReset()
  })

  it('sin proyecto usa el scope global', async () => {
    await expect(ensureProjectId(null)).resolves.toBe(NO_PROJECT_ID)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('usa el id existente sin reescribir el archivo', async () => {
    mocks.read.mockResolvedValue({ ok: true, data: '{"id":"existente"}' })

    await expect(ensureProjectId('/proyectos/alpha')).resolves.toBe('existente')
    expect(mocks.read).toHaveBeenCalledWith({
      scope: 'project',
      relative: 'history/id.json',
      projectRoot: '/proyectos/alpha'
    })
    expect(mocks.writeJson).not.toHaveBeenCalled()
  })

  it('crea un id nuevo si el archivo no existe', async () => {
    mocks.read.mockResolvedValue({ ok: true, data: null })
    mocks.writeJson.mockResolvedValue({ ok: true, data: '/proyectos/alpha/.scrakk/history/id.json' })

    const id = await ensureProjectId('/proyectos/alpha/')

    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(mocks.writeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'project',
        relative: 'history/id.json',
        projectRoot: '/proyectos/alpha',
        data: expect.objectContaining({ id, createdAt: expect.any(String) })
      })
    )
  })

  it('deduplica llamadas concurrentes para la misma raíz', async () => {
    mocks.read.mockResolvedValue({ ok: true, data: '{"id":"mismo"}' })

    const [a, b] = await Promise.all([
      ensureProjectId('/proyectos/alpha'),
      ensureProjectId('/proyectos/alpha')
    ])

    expect(a).toBe('mismo')
    expect(b).toBe('mismo')
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('si no puede escribir, usa una clave estable por ruta', async () => {
    mocks.read.mockResolvedValue({ ok: true, data: null })
    mocks.writeJson.mockResolvedValue({ ok: false, error: 'solo lectura' })

    const first = await ensureProjectId('/proyectos/alpha')
    const second = await ensureProjectId('/proyectos/alpha')

    expect(first).toBe('root:/proyectos/alpha')
    expect(second).toBe(first)
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })
})

describe('chatScope — separación del historial por proyecto', () => {
  const sessions: TestSession[] = [
    { id: 'a1', projectId: 'alpha' },
    { id: 'b1', projectId: 'beta' },
    { id: 'legacy' }
  ]

  it('filtra solo las sesiones del proyecto pedido', () => {
    expect(filterSessionsByProject(sessions, 'alpha').map((s) => s.id)).toEqual(['a1'])
    expect(filterSessionsByProject(sessions, 'beta').map((s) => s.id)).toEqual(['b1'])
    expect(filterSessionsByProject(sessions, NO_PROJECT_ID)).toEqual([])
  })

  it('migra las sesiones viejas al proyecto activo una sola vez', () => {
    const first = migrateLegacySessions(sessions, 'alpha')
    expect(first.changed).toBe(true)
    expect(first.sessions.map((s) => s.projectId)).toEqual(['alpha', 'beta', 'alpha'])

    const second = migrateLegacySessions(first.sessions, 'beta')
    expect(second.changed).toBe(false)
    expect(second.sessions).toBe(first.sessions)
  })
})
