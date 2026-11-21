// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Orquestador del cliente MCP en el renderer.
 *
 * Lee `.scrakk/mcp.json`, lo envía al main, y cuando el main publica cambios
 * de herramientas actualiza el ToolRegistry. TODO el ciclo de vida se inicia
 * desde `initMcp()` (una vez, al arrancar la app).
 */

import { api } from '@services/api'
import { loadMcpConfig, subscribeMcpConfig } from './config'
import { initMcpBridge } from './bridge'

let started = false
let offConfig: (() => void) | null = null
let offBridge: (() => void) | null = null

/** Carga config y la empuja al main para que conecte los servidores. */
export async function reloadMcpConfig(): Promise<void> {
  if (!api?.mcp?.configure) return
  const config = await loadMcpConfig()
  await api.mcp.configure(config.mcpServers, config.timeout)
}

/** Inicia el cliente MCP (idempotente). Devuelve una función de parada. */
export function initMcp(): () => void {
  if (started) return () => undefined
  started = true

  offBridge = initMcpBridge()
  void reloadMcpConfig()
  offConfig = subscribeMcpConfig(() => void reloadMcpConfig())

  return () => {
    offConfig?.()
    offBridge?.()
    offConfig = null
    offBridge = null
    started = false
  }
}

/** API cómoda para la UI de Ajustes. */
export const mcpService = {
  init: initMcp,
  reload: reloadMcpConfig,
  listServers: () => api?.mcp?.listServers?.() ?? Promise.resolve([]),
  connect: (id: string) => api?.mcp?.connect?.(id) ?? Promise.resolve(false),
  disconnect: (id: string) => api?.mcp?.disconnect?.(id) ?? Promise.resolve(false),
  callTool: api?.mcp?.callTool
    ? (id: string, name: string, args: Record<string, unknown>) => api.mcp.callTool(id, name, args)
    : () => Promise.resolve({ content: 'MCP no disponible', isError: true }),
  authStart: (id: string) => api?.mcp?.authStart?.(id) ?? Promise.resolve({ error: 'MCP no disponible' }),
  authStatus: (id: string) => api?.mcp?.authStatus?.(id) ?? Promise.resolve({ connected: false, needsAuth: false }),
  discover: () => api?.mcp?.discover?.() ?? Promise.resolve({ servers: [], scanned: [], errors: [] })
}
