// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Orquesta las fuentes de descubrimiento MCP y desduplica resultados. */

import type { McpDiscoveredServer, McpDiscoveryResult } from '@shared/mcp'
import { discoverOpencode } from './opencode'
import { discoverCodex } from './codex'
import { discoverRunning } from './running'

/** Clave estable para deduplicar (URL o command). */
function keyOf(server: McpDiscoveredServer): string {
  const config = server.config
  return config.url
    ? `url:${config.url}`
    : `cmd:${(config.command ?? []).join(' ')}`
}

export async function discoverMcpServers(): Promise<McpDiscoveryResult> {
  const opencode = discoverOpencode()
  const codex = discoverCodex()
  const running = await discoverRunning()

  const seen = new Set<string>()
  const servers: McpDiscoveredServer[] = []
  for (const candidate of [...opencode.servers, ...codex.servers, ...running.servers]) {
    const key = keyOf(candidate)
    if (!key || seen.has(key)) continue
    seen.add(key)
    servers.push(candidate)
  }

  return {
    servers,
    scanned: [...opencode.scanned, ...codex.scanned, ...running.scanned],
    errors: [...opencode.errors, ...codex.errors, ...running.errors]
  }
}

export { discoverOpencode, discoverCodex, discoverRunning }
