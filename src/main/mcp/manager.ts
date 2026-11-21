// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Manager de servidores MCP en el proceso main.
 *
 * Dueño de las conexiones, el catálogo de tools/resources/prompts y el estado
 * publicado al renderer. El renderer envía la config efectiva (`.scrakk/mcp.json`
 * user+project mergeados) con `configure`; acá se conecta, cachea y expone.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { MCP_IPC, mcpToolName, type McpCallResult, type McpConfigFile, type McpConnectionStatus, type McpPromptInfo, type McpResourceInfo, type McpServerConfig, type McpServerStatus, type McpToolInfo } from '@shared/mcp'
import { createTransport, HttpTransport, type RpcClient } from './transport'
import { startOAuth, getToken } from './oauth'

interface ConnectedServer {
  config: McpServerConfig
  transport: RpcClient | null
  tools: McpToolInfo[]
  resources: McpResourceInfo[]
  prompts: McpPromptInfo[]
  instructions?: string
  status: McpConnectionStatus
  error?: string
}

const CONNECT_TIMEOUT = 30_000
const CATALOG_TIMEOUT = 30_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Extrae el array de un resultado `tools/list` (soporta `{tools:[…]}`). */
function listOf(result: unknown, key: string): unknown[] {
  if (Array.isArray(result)) return result
  if (isRecord(result) && Array.isArray(result[key])) return result[key] as unknown[]
  return []
}

class McpManager {
  private servers = new Map<string, ConnectedServer>()
  private started = false
  private win: BrowserWindow | null = null

  attachWindow(win: BrowserWindow): void {
    this.win = win
  }

  /** Reemplaza la config y (re)conecta los servidores. */
  async configure(config: McpConfigFile): Promise<boolean> {
    const desired = config.mcpServers ?? {}
    const ids = new Set([...this.servers.keys(), ...Object.keys(desired)])

    for (const id of ids) {
      const next = desired[id]
      const current = this.servers.get(id)
      if (!next) {
        this.disconnect(id)
        this.servers.delete(id)
        continue
      }
      if (current && this.sameConfig(current.config, next)) continue
      this.disconnect(id)
      this.servers.set(id, {
        config: next,
        transport: null,
        tools: [],
        resources: [],
        prompts: [],
        status: next.disabled ? 'disabled' : 'disconnected'
      })
      if (!next.disabled) void this.connect(id)
    }
    this.emit()
    return true
  }

  private sameConfig(a: McpServerConfig, b: McpServerConfig): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private async connect(id: string): Promise<void> {
    const server = this.servers.get(id)
    if (!server || server.status === 'connecting') return
    server.status = 'connecting'
    server.error = undefined
    this.emit()

    let transport: RpcClient | null = null
    try {
      transport = createTransport(server.config)
      // OAuth: si el servidor es remoto y tiene token guardado, se lo pasamos
      // al transporte HTTP antes de iniciar el handshake.
      if (server.config.type === 'remote' && server.config.oauth !== false) {
        const token = getToken(server.config.id)
        if (token && transport instanceof HttpTransport) transport.setAuthToken(token)
      }
      await transport.start()
      // Un solo initialize: de ahí salen también las instructions del servidor
      // (OpenCode las inyecta en el system prompt como <mcp_instructions>).
      const initResult = await transport.request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'scrakk-studio', version: '0.1.6' }
      }, server.config.timeout?.startup ?? CONNECT_TIMEOUT)
      transport.notify('notifications/initialized')
      if (isRecord(initResult)) {
        const si = initResult.serverInfo
        if (isRecord(si) && typeof si.instructions === 'string') server.instructions = si.instructions
      }

      server.transport = transport
      await this.refreshCatalog(id)
      server.status = 'connected'
    } catch (error) {
      transport?.close()
      server.transport = null
      server.status = 'error'
      server.error = error instanceof Error ? error.message : String(error)
    }
    this.emit()
  }

  private async refreshCatalog(id: string): Promise<void> {
    const server = this.servers.get(id)
    if (!server?.transport) return
    const timeout = server.config.timeout?.catalog ?? CATALOG_TIMEOUT

    const toolsResult = await server.transport.request('tools/list', undefined, timeout).catch(() => null)
    server.tools = listOf(toolsResult, 'tools').flatMap((raw) => {
      if (!isRecord(raw) || typeof raw.name !== 'string') return []
      const schema = isRecord(raw.inputSchema) ? raw.inputSchema : { type: 'object', properties: {} }
      return [{
        name: mcpToolName(id, raw.name),
        originalName: raw.name,
        serverId: id,
        description: typeof raw.description === 'string' ? raw.description : '',
        inputSchema: schema
      }]
    })

    const resourcesResult = await server.transport.request('resources/list', undefined, timeout).catch(() => null)
    server.resources = listOf(resourcesResult, 'resources').flatMap((raw) => {
      if (!isRecord(raw) || typeof raw.uri !== 'string') return []
      return [{
        serverId: id,
        uri: raw.uri,
        name: typeof raw.name === 'string' ? raw.name : raw.uri,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : undefined
      }]
    })

    const promptsResult = await server.transport.request('prompts/list', undefined, timeout).catch(() => null)
    server.prompts = listOf(promptsResult, 'prompts').flatMap((raw) => {
      if (!isRecord(raw) || typeof raw.name !== 'string') return []
      return [{
        serverId: id,
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        arguments: Array.isArray(raw.arguments)
          ? raw.arguments.filter(isRecord).map((a) => ({
              name: String(a.name ?? ''),
              description: typeof a.description === 'string' ? a.description : undefined,
              required: a.required === true
            }))
          : undefined
      }]
    })
  }

  disconnect(id: string): boolean {
    const server = this.servers.get(id)
    if (!server) return false
    server.transport?.close()
    server.transport = null
    server.tools = []
    server.resources = []
    server.prompts = []
    server.status = server.config.disabled ? 'disabled' : 'disconnected'
    this.emit()
    return true
  }

  connectServer(id: string): boolean {
    const server = this.servers.get(id)
    if (!server) return false
    void this.connect(id)
    return true
  }

  async callTool(serverId: string, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const server = this.servers.get(serverId)
    if (!server?.transport || server.status !== 'connected') {
      return { content: `MCP server '${serverId}' no conectado`, isError: true }
    }
    const tool = server.tools.find((t) => t.originalName === name || t.name === name)
    const callName = tool?.originalName ?? name
    try {
      const result = await server.transport.request('tools/call', { name: callName, arguments: args }, server.config.timeout?.execution)
      return { content: extractText(result), isError: isRecord(result) && result.isError === true }
    } catch (error) {
      return { content: error instanceof Error ? error.message : String(error), isError: true }
    }
  }

  async listResources(serverId: string): Promise<McpResourceInfo[]> {
    const server = this.servers.get(serverId)
    if (!server?.transport) return []
    await this.refreshCatalog(serverId)
    return server.resources
  }

  async readResource(serverId: string, uri: string): Promise<{ text: string; mimeType?: string }> {
    const server = this.servers.get(serverId)
    if (!server?.transport) return { text: 'MCP server no conectado' }
    try {
      const result = await server.transport.request('resources/read', { uri }, server.config.timeout?.execution)
      return extractResource(result)
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error) }
    }
  }

  async listPrompts(serverId: string): Promise<McpPromptInfo[]> {
    const server = this.servers.get(serverId)
    if (!server?.transport) return []
    await this.refreshCatalog(serverId)
    return server.prompts
  }

  async getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<string> {
    const server = this.servers.get(serverId)
    if (!server?.transport) return 'MCP server no conectado'
    try {
      const result = await server.transport.request('prompts/get', { name, ...(args ? { arguments: args } : {}) }, server.config.timeout?.execution)
      return extractText(result)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  statuses(): McpServerStatus[] {
    return [...this.servers.values()].map((server) => ({
      id: server.config.id,
      status: server.status,
      error: server.error,
      toolCount: server.tools.length,
      resourceCount: server.resources.length,
      promptCount: server.prompts.length,
      instructions: server.instructions
    }))
  }

  allTools(): McpToolInfo[] {
    return [...this.servers.values()].flatMap((server) => server.tools)
  }

  instructions(): Array<{ name: string; text: string }> {
    return [...this.servers.values()]
      .filter((server) => server.status === 'connected' && server.instructions)
      .map((server) => ({ name: server.config.id, text: server.instructions as string }))
  }

  private emit(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send(MCP_IPC.serversChanged, this.statuses())
    this.win.webContents.send(MCP_IPC.toolsChanged)
  }

  registerIpc(): void {
    if (this.started) return
    this.started = true
    const handle = (channel: string, fn: (...args: any[]) => unknown): void => {
      ipcMain.handle(channel, (_event, ...args: any[]) => fn(...args))
    }
    handle(MCP_IPC.configure, (servers: unknown, timeout: unknown) =>
      this.configure({ mcpServers: isRecord(servers) ? servers as Record<string, McpServerConfig> : {}, timeout: timeout as McpConfigFile['timeout'] })
    )
    handle(MCP_IPC.listServers, () => this.statuses())
    handle(MCP_IPC.listTools, () => this.allTools())
    handle(MCP_IPC.connect, (id: string) => this.connectServer(id))
    handle(MCP_IPC.disconnect, (id: string) => this.disconnect(id))
    handle(MCP_IPC.callTool, (serverId: string, name: string, args: Record<string, unknown>) => this.callTool(serverId, name, args))
    handle(MCP_IPC.listResources, (serverId: string) => this.listResources(serverId))
    handle(MCP_IPC.readResource, (serverId: string, uri: string) => this.readResource(serverId, uri))
    handle(MCP_IPC.listPrompts, (serverId: string) => this.listPrompts(serverId))
    handle(MCP_IPC.getPrompt, (serverId: string, name: string, args?: Record<string, string>) => this.getPrompt(serverId, name, args))
    handle(MCP_IPC.authStart, (id: string) => {
      const server = this.servers.get(id)
      if (!server?.config.url) return Promise.resolve({ error: 'Servidor remoto no configurado' })
      return startOAuth(id, server.config.url, server.config.oauth)
    })
    handle(MCP_IPC.authStatus, (id: string) => {
      const server = this.servers.get(id)
      return {
        connected: server?.status === 'connected',
        needsAuth: server?.status === 'error' && server.config.type === 'remote'
      }
    })
  }
}

/** Contenido textual de un result de herramienta MCP. */
function extractText(result: unknown): string {
  if (!isRecord(result)) return String(result ?? '')
  if (typeof result.content === 'string') return result.content
  if (Array.isArray(result.content)) {
    return result.content
      .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return JSON.stringify(result)
}

function extractResource(result: unknown): { text: string; mimeType?: string } {
  if (!isRecord(result)) return { text: String(result ?? '') }
  const contents = Array.isArray(result.contents) ? result.contents : []
  const first = contents.find(isRecord)
  if (first) {
    return {
      text: typeof first.text === 'string' ? first.text : String(first.blob ?? ''),
      mimeType: typeof first.mimeType === 'string' ? first.mimeType : undefined
    }
  }
  return { text: JSON.stringify(result) }
}

export const mcpManager = new McpManager()
