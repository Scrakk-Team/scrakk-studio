// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Config de servidores MCP persistida en `.scrakk/mcp.json`.
 *
 * Mismo patrón que modes/permissions: capas user → project (gana project),
 * escritura atómica vía ScrakkFsApi y watch para recargar en vivo.
 */

import { scrakkHandle, onScrakkChanged as onChanged, type ScrakkScope } from '@services/scrakk'
import type { McpConfigFile, McpServerConfig } from '@shared/mcp'

const FILE = 'mcp.json'

function parseConfig(raw: Record<string, unknown> | null): McpConfigFile {
  if (!raw) return { mcpServers: {} }
  const servers = raw.mcpServers
  const valid: Record<string, McpServerConfig> = {}
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    for (const [id, value] of Object.entries(servers as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        valid[id] = { id, ...(value as Omit<McpServerConfig, 'id'>) }
      }
    }
  }
  return {
    mcpServers: valid,
    timeout: (raw.timeout as McpConfigFile['timeout']) ?? undefined
  }
}

/** Lee la config de una capa (user o project). */
export async function readMcpConfig(scope: ScrakkScope): Promise<McpConfigFile> {
  const result = await scrakkHandle(scope).readJson(FILE).catch(() => null)
  return parseConfig(result?.ok ? result.data : null)
}

/** Config efectiva: user + project, gana project. */
export async function loadMcpConfig(): Promise<McpConfigFile> {
  const [user, project] = await Promise.all([
    readMcpConfig('user'),
    readMcpConfig('project')
  ])
  return {
    mcpServers: { ...user.mcpServers, ...project.mcpServers },
    timeout: project.timeout ?? user.timeout
  }
}

/** Escribe la config en una capa. `scope` por defecto project (config del workspace). */
export async function writeMcpConfig(
  servers: Record<string, McpServerConfig>,
  scope: ScrakkScope = 'project',
  timeout?: McpConfigFile['timeout']
): Promise<boolean> {
  const data: Record<string, unknown> = { mcpServers: servers }
  if (timeout) data.timeout = timeout
  const result = await scrakkHandle(scope).writeJson(FILE, data).catch(() => null)
  return result?.ok === true
}

/** Suscribe a cambios de mcp.json (user o project). */
export function subscribeMcpConfig(listener: () => void): () => void {
  // El watcher de `.scrakk` emite eventos con `relative === 'mcp.json'`.
  // Se usa el evento global y se filtra acá para no depender de dos handles.
  void scrakkHandle('user').watch(FILE).catch(() => undefined)
  void scrakkHandle('project').watch(FILE).catch(() => undefined)
  let disposed = false
  const off = onChanged((event) => {
    if (!disposed && event.relative === FILE) listener()
  })
  return () => {
    disposed = true
    off()
  }
}
