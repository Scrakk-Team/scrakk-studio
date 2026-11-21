// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Importador de la config MCP de Codex (`~/.codex/config.toml`).
 *
 * TOML es amplio; acá sólo se parsea lo que importa: secciones
 * `[mcp_servers.<id>]`, sus claves escalares y la sub-tabla
 * `[mcp_servers.<id>.env]`. Sin dependencias nuevas.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { McpDiscoveredServer, McpServerConfig } from '@shared/mcp'

type Section = Record<string, unknown>

function configPath(): string {
  return path.join(os.homedir(), '.codex', 'config.toml')
}

/** Quita comentarios `#` fuera de strings. */
function stripComments(line: string): string {
  let inString = false
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '#') return line.slice(0, i)
  }
  return line
}

/** Parsea un valor TOML escalar (string, bool, número o array simple). */
function parseValue(raw: string): unknown {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((item) => parseValue(item)).filter((v) => v !== null)
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  return value
}

/** Lee los servidores MCP de Codex. Nunca lanza. */
export function discoverCodex(): { servers: McpDiscoveredServer[]; scanned: string[]; errors: string[] } {
  const file = configPath()
  const scanned = [file]
  const errors: string[] = []
  const found: McpDiscoveredServer[] = []

  let text: string
  try {
    text = readFileSync(file, 'utf-8')
  } catch {
    return { servers: [], scanned, errors }
  }

  const servers = new Map<string, Section>()
  let current: string | null = null // 'id' o 'id.env'
  for (const line of text.split('\n')) {
    const clean = stripComments(line).trim()
    if (!clean) continue
    const header = /^\[([^\]]+)\]$/.exec(clean)
    if (header) {
      const name = header[1].trim()
      const mcp = /^mcp_servers\.([^.]+)(\.env)?$/.exec(name)
      if (mcp) {
        const id = mcp[1]
        current = id + (mcp[2] ? '.env' : '')
        if (!servers.has(id)) servers.set(id, {})
      } else {
        current = null
      }
      continue
    }
    if (!current) continue
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(clean)
    if (!pair) continue
    const [id, sub] = current.split('.')
    const section = servers.get(id)
    if (!section) continue
    if (sub === 'env') {
      const env = (section.env ?? {}) as Record<string, string>
      env[pair[1]] = String(parseValue(pair[2]) ?? '')
      section.env = env
    } else {
      section[pair[1]] = parseValue(pair[2])
    }
  }

  for (const [id, section] of servers) {
    const command = Array.isArray(section.command)
      ? (section.command as unknown[]).map(String)
      : typeof section.command === 'string'
        ? [section.command]
        : []
    const args = Array.isArray(section.args) ? (section.args as unknown[]).map(String) : []
    const config: McpServerConfig = {
      id,
      type: section.type === 'http' || section.url ? 'remote' : 'local',
      ...(command.length ? { command: [...command, ...args] } : {}),
      ...(typeof section.url === 'string' ? { url: section.url } : {}),
      ...(section.env ? { environment: section.env as Record<string, string> } : {}),
      ...(section.disabled === true ? { disabled: true } : {})
    }
    if (!config.command && !config.url) continue
    found.push({ id, source: 'codex', config })
  }
  return { servers: found, scanned, errors }
}
