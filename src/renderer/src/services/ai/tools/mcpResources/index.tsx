// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tools built-in para leer RECURSOS de servidores MCP (OpenCode expone los
 * suyos con `list_mcp_resources` / `read_mcp_resource`). No dependen de que
 * haya servidores conectados: responden con lista vacía / error claro.
 */

import type { JSX } from 'react'
import { api } from '@services/api'
import type { Tool, ExecutionResult, ToolContext } from '../types'
import { DEFAULT_TOOL_TYPE } from '../catalog'

function render(label: string, args: Record<string, unknown>, status?: string): JSX.Element {
  if (status === 'pending' || status === 'running') return <span>{label}…</span>
  return <span>{label}{Object.values(args)[0] ? ` · ${String(Object.values(args)[0])}` : ''}</span>
}

export const listMcpResourcesTool: Tool = {
  name: 'list_mcp_resources',
  definition: {
    type: 'function',
    function: {
      name: 'list_mcp_resources',
      description: 'Lista los recursos disponibles en los servidores MCP conectados. Devuelve servidor, URI y nombre.',
      parameters: { type: 'object', properties: { server: { type: 'string', description: 'Id del servidor (opcional; sin él lista todos).' } } }
    }
  },
  permissions: [],
  meta: {
    name: 'list_mcp_resources',
    label: 'Listar recursos MCP',
    description: 'Recursos de servidores MCP conectados.',
    type: DEFAULT_TOOL_TYPE,
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'layers',
    onOpen: 'self',
    renderBody: (args, _result, status) => render('Recursos MCP', args, status)
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> => {
    const server = typeof args.server === 'string' ? args.server : null
    const statuses = (await api?.mcp?.listServers?.()) ?? []
    const connected = statuses.filter((s) => s.status === 'connected' && (!server || s.id === server))
    if (connected.length === 0) return { success: true, content: 'No hay servidores MCP conectados.' }
    const blocks: string[] = []
    for (const s of connected) {
      const resources = (await api?.mcp?.listResources?.(s.id)) ?? []
      blocks.push(`## ${s.id}\n${resources.map((r) => `- ${r.uri} — ${r.name}`).join('\n') || '(sin recursos)'}`)
    }
    return { success: true, content: blocks.join('\n\n') }
  }
}

export const readMcpResourceTool: Tool = {
  name: 'read_mcp_resource',
  definition: {
    type: 'function',
    function: {
      name: 'read_mcp_resource',
      description: 'Lee el contenido de un recurso de un servidor MCP. Formato del argumento: "server:uri".',
      parameters: {
        type: 'object',
        required: ['resource'],
        properties: { resource: { type: 'string', description: 'Recurso en formato server:uri' } }
      }
    }
  },
  permissions: [],
  meta: {
    name: 'read_mcp_resource',
    label: 'Leer recurso MCP',
    description: 'Contenido de un recurso MCP.',
    type: DEFAULT_TOOL_TYPE,
    dangerLevel: 'safe',
    enabledByDefault: true,
    icon: 'file-text',
    onOpen: 'self',
    renderBody: (args, _result, status) => render('Leer recurso MCP', args, status)
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ExecutionResult> => {
    const value = typeof args.resource === 'string' ? args.resource : ''
    const separator = value.indexOf(':')
    if (separator <= 0) {
      return { success: false, content: 'Formato inválido: usa "server:uri".' }
    }
    const serverId = value.slice(0, separator)
    const uri = value.slice(separator + 1)
    const res = (await api?.mcp?.readResource?.(serverId, uri)) ?? { text: 'MCP no disponible' }
    return { success: true, content: res.text }
  }
}
