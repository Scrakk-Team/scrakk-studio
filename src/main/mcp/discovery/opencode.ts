// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Importador de la config MCP de OpenCode.
 *
 * Lee `~/.config/opencode/opencode.json(c)` (y `$XDG_CONFIG_HOME`). OpenCode V2
 * pone los servidores en `mcp.servers`, pero configs V1 los tienen en `mcp`
 * directo: se soportan ambos. JSONC se tolera quitando comentarios.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { McpDiscoveredServer, McpServerConfig } from '@shared/mcp'

interface RawServer {
  type?: string
  command?: string[]
  url?: string
  environment?: Record<string, string>
  headers?: Record<string, string>
  enabled?: boolean
  cwd?: string
  oauth?: unknown
}

/** Quita comentarios de línea y de bloque de un JSONC (sin tocar strings). */
function stripJsonc(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inString) {
      out += c
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      i++
      continue
    }
    if (c === '"') { inString = true; out += c; i++; continue }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

function configPaths(): string[] {
  const base = process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config')
  return [
    path.join(base, 'opencode', 'opencode.jsonc'),
    path.join(base, 'opencode', 'opencode.json')
  ]
}

/** Lee los servidores MCP de OpenCode. Nunca lanza. */
export function discoverOpencode(): { servers: McpDiscoveredServer[]; scanned: string[]; errors: string[] } {
  const scanned: string[] = []
  const errors: string[] = []
  const found: McpDiscoveredServer[] = []

  for (const file of configPaths()) {
    scanned.push(file)
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(stripJsonc(readFileSync(file, 'utf-8'))) as Record<string, unknown>
    } catch {
      continue // archivo inexistente o inválido: se prueba el siguiente
    }
    const mcp = raw.mcp
    if (!mcp || typeof mcp !== 'object') continue
    const container = mcp as Record<string, unknown>
    // V2: { mcp: { servers: {...} } }; V1: { mcp: {...} }
    const servers = (container.servers ?? container) as Record<string, RawServer>
    for (const [id, value] of Object.entries(servers)) {
      if (id === 'servers' || id === 'timeout' || !value || typeof value !== 'object') continue
      const config: McpServerConfig = {
        id,
        type: value.type === 'local' ? 'local' : value.url ? 'remote' : 'local',
        ...(value.command?.length ? { command: value.command } : {}),
        ...(value.url ? { url: value.url } : {}),
        ...(value.environment ? { environment: value.environment } : {}),
        ...(value.headers ? { headers: value.headers } : {}),
        ...(value.cwd ? { cwd: value.cwd } : {}),
        ...(value.enabled === false ? { disabled: true } : {}),
        ...(value.oauth === false ? { oauth: false } : {})
      }
      if (!config.command && !config.url) continue
      found.push({ id, source: 'opencode', config })
    }
    break // primera config válida gana
  }
  return { servers: found, scanned, errors }
}
