// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Puente MCP → ToolRegistry.
 *
 * Cada tool expuesto por un servidor MCP se registra como un `Tool` normal con
 * nombre `<server>_<tool>` (normalizado como OpenCode). De ahí en adelante todo
 * el pipeline existente aplica: anuncio al LLM, filtros de modo/agente, policy,
 * confirmación, timeout y render en el chat.
 */

import type { JSX } from 'react'
import { api } from '@services/api'
import { registry, type Tool, type ExecutionResult, type ToolContext } from '@services/ai/tools'
import { MCP_TOOL_TYPE } from '@services/ai/tools/catalog'
import { t } from '@core/i18n'
import type { McpServerStatus, McpToolInfo } from '@shared/mcp'

/** Herramientas que el main NO expone como tools del modelo (son built-ins). */
const BUILTIN_MCP_TOOLS = new Set(['list_mcp_resources', 'read_mcp_resource'])

function renderBody(label: string, args: Record<string, unknown>, result?: string, status?: string): JSX.Element | null {
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <span>{label}…</span>
  }
  const first = Object.values(args)[0]
  const suffix = typeof first === 'string' ? ` · ${first}` : ''
  return <span title={result}>{label}{suffix}</span>
}

function buildMcpTool(info: McpToolInfo): Tool {
  const label = info.originalName
  return {
    name: info.name,
    definition: {
      type: 'function',
      function: {
        name: info.name,
        description: info.description || `${t('services.mcp.herramienta.de')} ${info.serverId}`,
        parameters: info.inputSchema
      }
    },
    permissions: [],
    meta: {
      name: info.name,
      label,
      description: info.description,
      type: MCP_TOOL_TYPE,
      dangerLevel: 'medium',
      enabledByDefault: true,
      icon: 'server',
      expandable: true,
      renderBody: (args, result, status) =>
        renderBody(label, args, typeof result === 'string' ? result : undefined, status)
    },
    execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> => {
      const res = await api?.mcp?.callTool?.(info.serverId, info.originalName, args)
      if (!res) return { success: false, content: 'MCP bridge no disponible' }
      return { success: !res.isError, content: res.content }
    }
  }
}

/** Reemplaza los tools MCP del registry con los del catálogo dado. */
export function syncMcpTools(tools: McpToolInfo[]): void {
  const desired = new Map<string, McpToolInfo>()
  for (const tool of tools) {
    if (BUILTIN_MCP_TOOLS.has(tool.name)) continue
    desired.set(tool.name, tool)
  }

  // Quitar los que ya no están.
  for (const existing of registry.getAll()) {
    if (existing.meta?.type === MCP_TOOL_TYPE && !desired.has(existing.name)) {
      registry.unregister(existing.name)
    }
  }
  // Registrar/actualizar los actuales.
  for (const info of desired.values()) {
    const tool = buildMcpTool(info)
    if (registry.has(info.name)) registry.unregister(info.name)
    registry.register(tool, { allowOverwrite: true })
  }
}

/** Estado actual de servidores (para UI/instrucciones). */
let statuses: McpServerStatus[] = []
export function getMcpStatuses(): McpServerStatus[] {
  return statuses
}

export function initMcpBridge(): () => void {
  const offStatus = api?.mcp?.onServersChanged?.((next) => {
    statuses = next
  }) ?? (() => undefined)

  const refreshTools = (): void => {
    void api?.mcp?.listTools?.().then(syncMcpTools).catch(() => undefined)
  }
  const offTools = api?.mcp?.onToolsChanged?.(refreshTools) ?? (() => undefined)
  // Primera carga (por si el evento se emitió antes de suscribirnos).
  refreshTools()

  return () => {
    offStatus()
    offTools()
  }
}
