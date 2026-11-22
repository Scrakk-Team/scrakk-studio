// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Auto-detección de MCPs de otros agentes: parsea la config REAL de OpenCode
 * (/mcp.servers y /mcp V1) y la TOML de Codex ([mcp_servers.x]).
 *
 * HERMÉTICO: antes estas pruebas leían el HOME del desarrollador, así que en
 * CI (sin esos archivos) fallaban. Ahora se crean configs fixture en un HOME
 * temporal y se mockea `os.homedir()` antes de importar los discovery.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(
  () => (process.env['TMPDIR'] ?? '/tmp') + '/scrakk-mcp-discovery-fixture'
)

vi.mock('node:os', () => ({
  default: { homedir: () => fixture, tmpdir: () => '/tmp' },
  homedir: () => fixture,
  tmpdir: () => '/tmp'
}))

beforeAll(() => {
  const config = path.join(fixture, 'config')
  mkdirSync(path.join(config, 'opencode'), { recursive: true })
  mkdirSync(path.join(fixture, '.codex'), { recursive: true })
  mkdirSync(path.join(fixture, '.cline', 'data', 'settings'), { recursive: true })
  process.env['XDG_CONFIG_HOME'] = config

  writeFileSync(
    path.join(config, 'opencode', 'opencode.json'),
    JSON.stringify({
      mcp: {
        servers: {
          supabase: { type: 'remote', url: 'https://mcp.supabase.com/mcp' },
          hostinger: {
            command: ['hostinger-api-mcp'],
            environment: { HOSTINGER_API_TOKEN: 'fixture-token' }
          }
        }
      }
    })
  )
  writeFileSync(
    path.join(fixture, '.codex', 'config.toml'),
    [
      '[mcp_servers.supabase]',
      'url = "https://mcp.supabase.com/mcp"',
      '',
      '[mcp_servers.codebase-memory-mcp]',
      'command = "codebase-memory-mcp"',
      ''
    ].join('\n')
  )
  writeFileSync(
    path.join(fixture, '.cline', 'data', 'settings', 'cline_mcp_settings.json'),
    JSON.stringify({
      mcpServers: {
        supabase: {
          type: 'streamableHttp',
          url: 'https://mcp.supabase.com/mcp',
          oauth: { clientInformation: { client_id: 'fixture-client' } }
        },
        'codebase-memory-mcp': { command: 'codebase-memory-mcp' }
      }
    })
  )
  writeFileSync(
    path.join(fixture, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        cloudflare: { type: 'http', url: 'https://mcp.cloudflare.com/mcp' }
      }
    })
  )
})

const { discoverOpencode } = await import('../src/main/mcp/discovery/opencode')
const { discoverCodex } = await import('../src/main/mcp/discovery/codex')
const { discoverCline, discoverClaude } = await import('../src/main/mcp/discovery/agents')

describe('MCP discovery', () => {
  it('importa los servidores de la config de OpenCode del sistema', () => {
    const result = discoverOpencode()
    expect(result.scanned.length).toBeGreaterThan(0)
    expect(result.servers.length).toBeGreaterThan(0)
    const supabase = result.servers.find((s) => s.id === 'supabase')
    expect(supabase?.config.type).toBe('remote')
    expect(supabase?.config.url).toContain('mcp.supabase.com')
    const hostinger = result.servers.find((s) => s.id === 'hostinger')
    expect(hostinger?.config.command?.[0]).toBe('hostinger-api-mcp')
    expect(hostinger?.config.environment?.HOSTINGER_API_TOKEN).toBeTruthy()
  })

  it('importa los servidores de la config TOML de Codex del sistema', () => {
    const result = discoverCodex()
    expect(result.scanned.length).toBeGreaterThan(0)
    const supabase = result.servers.find((s) => s.id === 'supabase')
    expect(supabase?.config.type).toBe('remote')
    const codebase = result.servers.find((s) => s.id === 'codebase-memory-mcp')
    expect(codebase?.config.command?.[0]).toContain('codebase-memory-mcp')
  })

  it('importa los servidores de Cline (con client_id OAuth pre-registrado)', () => {
    const result = discoverCline()
    expect(result.scanned.length).toBeGreaterThan(0)
    const supabase = result.servers.find((s) => s.id === 'supabase')
    expect(supabase?.config.type).toBe('remote')
    const oauth = supabase?.config.oauth
    expect(oauth && typeof oauth === 'object' && 'clientId' in oauth && oauth.clientId).toBeTruthy()
    const codebase = result.servers.find((s) => s.id === 'codebase-memory-mcp')
    expect(codebase?.config.command?.[0]).toContain('codebase-memory-mcp')
  })

  it('importa los servidores de Claude Code', () => {
    const result = discoverClaude()
    expect(result.scanned.length).toBeGreaterThan(0)
    const cloudflare = result.servers.find((s) => s.id === 'cloudflare')
    expect(cloudflare?.config.type).toBe('remote')
    expect(cloudflare?.config.url).toContain('mcp.cloudflare.com')
  })
})
