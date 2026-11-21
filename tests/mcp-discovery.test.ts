// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Auto-detección de MCPs de otros agentes: parsea la config REAL de OpenCode
 * (/mcp.servers y /mcp V1) y la TOML de Codex ([mcp_servers.x]).
 */

import { describe, expect, it } from 'vitest'
import { discoverOpencode } from '../src/main/mcp/discovery/opencode'
import { discoverCodex } from '../src/main/mcp/discovery/codex'

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
})
