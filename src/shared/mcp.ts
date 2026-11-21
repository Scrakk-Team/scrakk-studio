// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Contrato compartido del cliente MCP (main + preload + renderer).
 *
 * Un servidor MCP puede ser LOCAL (stdio) o REMOTO (Streamable HTTP + OAuth).
 * La config se guarda en `.scrakk/mcp.json` (capas user/project); los tokens
 * OAuth NO van ahí: viven en userData con permisos restrictivos.
 */

export const MCP_IPC = {
  /** Descubre servidores en la config de otros agentes / procesos activos. */
  discover: 'mcp:discover',
  /** Renderer → main: config efectiva (user+project ya mergeados). */
  configure: 'mcp:configure',
  listServers: 'mcp:list-servers',
  listTools: 'mcp:list-tools',
  setServer: 'mcp:set-server',
  removeServer: 'mcp:remove-server',
  connect: 'mcp:connect',
  disconnect: 'mcp:disconnect',
  callTool: 'mcp:call-tool',
  listResources: 'mcp:list-resources',
  readResource: 'mcp:read-resource',
  listPrompts: 'mcp:list-prompts',
  getPrompt: 'mcp:get-prompt',
  authStart: 'mcp:auth-start',
  authStatus: 'mcp:auth-status',
  /** Eventos main → renderer. */
  serversChanged: 'mcp:servers-changed',
  toolsChanged: 'mcp:tools-changed'
} as const

/** Config de un servidor tal como se persiste en mcp.json. */
export interface McpServerConfig {
  id: string
  type: 'local' | 'remote'
  disabled?: boolean
  /** Local: executable + argumentos (command[0] es el binario). */
  command?: string[]
  cwd?: string
  /** Variables de entorno; valores `{env:NAME}` se resuelven del entorno. */
  environment?: Record<string, string>
  /** Remote: endpoint Streamable HTTP absoluto. */
  url?: string
  headers?: Record<string, string>
  /** OAuth. `false` desactiva; si no se especifica, se usa por defecto en remote. */
  oauth?: McpOAuthConfig | false
  /** Timeouts en ms. */
  timeout?: { startup?: number; catalog?: number; execution?: number }
  /** Nombre para mostrar (por defecto el id). */
  label?: string
}

export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
  callbackPort?: number
  redirectUri?: string
}

/** Forma del archivo `.scrakk/mcp.json`. */
export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
  timeout?: { startup?: number; catalog?: number; execution?: number }
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'disabled'

/** Estado que el main publica al renderer. */
export interface McpServerStatus {
  id: string
  status: McpConnectionStatus
  error?: string
  toolCount: number
  resourceCount: number
  promptCount: number
  /** true si OAuth necesita que el usuario inicie sesión. */
  needsAuth?: boolean
  instructions?: string
}

/** Tool expuesto por un servidor (después de normalizar el nombre). */
export interface McpToolInfo {
  /** Nombre normalizado `<server>_<tool>` (el que ve el modelo). */
  name: string
  /** Nombre original del tool en el servidor. */
  originalName: string
  serverId: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpResourceInfo {
  serverId: string
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpPromptInfo {
  serverId: string
  name: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

/** Resultado de una llamada a tool MCP (contenido textual para el LLM). */
export interface McpCallResult {
  content: string
  isError?: boolean
}

/** De dónde se importó un servidor descubierto. */
export type McpImportSource = 'opencode' | 'codex' | 'running'

/** Servidor candidato encontrado por el escáner (aún no importado). */
export interface McpDiscoveredServer {
  id: string
  source: McpImportSource
  config: McpServerConfig
}

/** Respuesta del descubrimiento. */
export interface McpDiscoveryResult {
  servers: McpDiscoveredServer[]
  /** Rutas de config que se intentaron (para el UI: "leído de …"). */
  scanned: string[]
  errors: string[]
}

/** Normaliza un nombre de servidor/tool como OpenCode: sólo [A-Za-z0-9_-]. */
export function normalizeMcpName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Nombre completo `<server>_<tool>` normalizado. */
export function mcpToolName(serverId: string, toolName: string): string {
  return `${normalizeMcpName(serverId)}_${normalizeMcpName(toolName)}`
}

/** API que el preload expone en `window.api.mcp`. */
export interface McpApi {
  configure: (servers: Record<string, McpServerConfig>, timeout?: McpConfigFile['timeout']) => Promise<boolean>
  discover: () => Promise<McpDiscoveryResult>
  listServers: () => Promise<McpServerStatus[]>
  listTools: () => Promise<McpToolInfo[]>
  setServer: (config: McpServerConfig) => Promise<boolean>
  removeServer: (id: string) => Promise<boolean>
  connect: (id: string) => Promise<boolean>
  disconnect: (id: string) => Promise<boolean>
  callTool: (serverId: string, name: string, args: Record<string, unknown>) => Promise<McpCallResult>
  listResources: (serverId: string) => Promise<McpResourceInfo[]>
  readResource: (serverId: string, uri: string) => Promise<{ text: string; mimeType?: string }>
  listPrompts: (serverId: string) => Promise<McpPromptInfo[]>
  getPrompt: (serverId: string, name: string, args?: Record<string, string>) => Promise<string>
  authStart: (id: string) => Promise<{ url?: string; error?: string }>
  authStatus: (id: string) => Promise<{ connected: boolean; needsAuth: boolean }>
  onServersChanged: (cb: (statuses: McpServerStatus[]) => void) => () => void
  onToolsChanged: (cb: () => void) => () => void
}
