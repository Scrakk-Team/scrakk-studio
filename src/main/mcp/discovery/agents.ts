// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Importadores de configs MCP de Cline y Claude Code.
 *
 * Cline: ~/.cline/data/settings/cline_mcp_settings.json → { mcpServers: {…} }
 *   - tipos: 'streamableHttp' | 'sse' → remote; si no, command+args → local
 *   - oauth.clientInformation trae client_id/secret pre-registrados
 * Claude Code: ~/.claude.json → { mcpServers: {…} }
 *   - type 'http' | 'sse' → remote; si no, command → local
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { McpDiscoveredServer, McpServerConfig } from '@shared/mcp'

interface RawServer {
  type?: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  environment?: Record<string, string>
  headers?: Record<string, string>
  disabled?: boolean
  oauth?: {
    clientInformation?: { client_id?: string; client_secret?: string; redirect_uris?: string[] }
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function toConfig(id: string, raw: RawServer): McpServerConfig | null {
  const command = [
    ...(typeof raw.command === 'string' ? [raw.command] : []),
    ...(Array.isArray(raw.args) ? raw.args.map(String) : [])
  ]
  const remoteType = raw.type === 'http' || raw.type === 'streamableHttp' || raw.type === 'sse'
  const config: McpServerConfig = {
    id,
    type: raw.url || remoteType ? 'remote' : 'local',
    ...(raw.url ? { url: raw.url } : {}),
    ...(command.length && !raw.url ? { command } : {}),
    ...(raw.env ? { environment: raw.env } : {}),
    ...(raw.environment ? { environment: raw.environment } : {}),
    ...(raw.headers ? { headers: raw.headers } : {}),
    ...(raw.disabled ? { disabled: true } : {}),
    ...(raw.oauth?.clientInformation?.client_id
      ? {
          oauth: {
            clientId: raw.oauth.clientInformation.client_id,
            ...(raw.oauth.clientInformation.client_secret
              ? { clientSecret: raw.oauth.clientInformation.client_secret }
              : {}),
            ...(raw.oauth.clientInformation.redirect_uris?.[0]
              ? { redirectUri: raw.oauth.clientInformation.redirect_uris[0] }
              : {})
          }
        }
      : {})
  }
  if (!config.command && !config.url) return null
  return config
}

function discover(file: string, source: 'cline' | 'claude'): { servers: McpDiscoveredServer[]; scanned: string[]; errors: string[] } {
  const scanned = [file]
  const data = readJson(file)
  const servers: McpDiscoveredServer[] = []
  if (!data) return { servers, scanned, errors: [] }
  const raw = data.mcpServers
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { servers, scanned, errors: [] }
  for (const [id, value] of Object.entries(raw as Record<string, RawServer>)) {
    if (!value || typeof value !== 'object') continue
    const config = toConfig(id, value)
    if (config) servers.push({ id, source, config })
  }
  return { servers, scanned, errors: [] }
}

export function discoverCline(): ReturnType<typeof discover> {
  return discover(path.join(os.homedir(), '.cline', 'data', 'settings', 'cline_mcp_settings.json'), 'cline')
}

export function discoverClaude(): ReturnType<typeof discover> {
  return discover(path.join(os.homedir(), '.claude.json'), 'claude')
}
