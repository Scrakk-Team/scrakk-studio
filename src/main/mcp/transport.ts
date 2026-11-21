// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Transporte JSON-RPC para MCP.
 *
 * MCP stdio usa FRAMING POR LÍNEAS (un JSON por línea, \n delimitador) —
 * distinto del `Content-Length` de LSP. HTTP usa Streamable HTTP (POST con
 * JSON-RPC, respuesta JSON o SSE).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { spawnInvocation } from '../binaries'
import { childEnv } from '../env'
import type { McpServerConfig } from '@shared/mcp'

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** Cliente JSON-RPC base: maneja ids, pendientes y timeouts. */
export abstract class RpcClient {
  protected nextId = 1
  protected pending = new Map<number | string, Pending>()
  protected executionTimeout = 600_000

  request(method: string, params?: unknown, timeoutMs = this.executionTimeout): Promise<unknown> {
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.send({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {})
      })
    })
  }

  notify(method: string, params?: unknown): void {
    this.send({
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {})
    })
  }

  protected onMessage(message: JsonRpcResponse): void {
    if (message.id === undefined || message.id === null) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.error) {
      pending.reject(new Error(message.error.message))
    } else {
      pending.resolve(message.result)
    }
  }

  protected abstract send(payload: unknown): void
  abstract start(): Promise<void>
  abstract close(): void
}

/** Transporte stdio: un servidor local lanzado como hijo. */
export class StdioTransport extends RpcClient {
  private child: ChildProcess | null = null
  private buffer = ''
  private stderrTail = ''
  private closed = false

  constructor(private config: McpServerConfig) {
    super()
    this.executionTimeout = config.timeout?.execution ?? 600_000
  }

  async start(): Promise<void> {
    const command = this.config.command?.[0]
    if (!command) throw new Error('MCP local sin command')

    const invocation = spawnInvocation(command, this.config.command?.slice(1) ?? [])
    const env = { ...childEnv(), ...resolveEnv(this.config.environment) }
    const child = spawn(invocation.file, invocation.args, {
      cwd: this.config.cwd || process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: invocation.shell
    })
    this.child = child

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).split('\n').slice(-10).join('\n').slice(-1200)
    })

    child.stdout?.setEncoding('utf-8')
    child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      // Framing MCP: una línea por mensaje.
      let index = this.buffer.indexOf('\n')
      while (index >= 0) {
        const line = this.buffer.slice(0, index).trim()
        this.buffer = this.buffer.slice(index + 1)
        if (line) {
          try {
            this.onMessage(JSON.parse(line) as JsonRpcResponse)
          } catch {
            // Línea no-JSON: se ignora (algunos servers escriben logs a stdout).
          }
        }
        index = this.buffer.indexOf('\n')
      }
    })

    child.on('error', (error) => this.failAll(error))
    child.on('exit', () => {
      this.closed = true
      this.failAll(new Error(`MCP server exited: ${this.stderrTail || 'sin stderr'}`))
    })
  }

  protected send(payload: unknown): void {
    if (!this.child?.stdin || this.closed) throw new Error('MCP transport cerrado')
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.failAll(new Error('MCP transport cerrado'))
    this.child?.kill('SIGTERM')
    this.child = null
  }
}

/** Transporte Streamable HTTP. `fetchUrl` NO se usa acá: este código corre en main. */
export class HttpTransport extends RpcClient {
  private closed = false
  private authToken: string | null = null
  private sessionId: string | null = null

  constructor(private config: McpServerConfig) {
    super()
    this.executionTimeout = config.timeout?.execution ?? 600_000
  }

  async start(): Promise<void> {
    if (!this.config.url) throw new Error('MCP remote sin url')
  }

  setAuthToken(token: string | null): void {
    this.authToken = token
  }

  protected async send(payload: unknown): Promise<void> {
    if (this.closed) throw new Error('MCP transport cerrado')
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...resolveEnv(this.config.headers)
    }
    if (this.authToken) headers.authorization = `Bearer ${this.authToken}`
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId

    // El request se dispara acá; la respuesta se maneja en request() mediante
    // un override: guardamos el id y lo resolvemos con la respuesta HTTP.
    const id = (payload as { id?: number | string }).id
    try {
      const response = await fetch(this.config.url as string, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
      const session = response.headers.get('mcp-session-id')
      if (session) this.sessionId = session
      if (!response.ok) {
        if (id !== undefined) this.onMessage({ jsonrpc: '2.0', id, error: { code: -1, message: `HTTP ${response.status}` } })
        return
      }
      const text = await response.text()
      // Streamable HTTP puede responder SSE (eventos) o JSON directo.
      const json = parseSseOrJson(text, id)
      if (json && id !== undefined) this.onMessage(json)
    } catch (error) {
      if (id !== undefined) {
        this.onMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -1, message: error instanceof Error ? error.message : String(error) }
        })
      }
    }
  }

  close(): void {
    this.closed = true
  }
}

/** Extrae el primer mensaje JSON de una respuesta SSE o JSON plana. */
function parseSseOrJson(text: string, id: number | string | undefined): JsonRpcResponse | null {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as JsonRpcResponse
    } catch {
      return null
    }
  }
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data:')) continue
    try {
      const parsed = JSON.parse(line.slice(5).trim()) as JsonRpcResponse
      if (parsed.id === id) return parsed
    } catch {
      // sigue buscando
    }
  }
  return null
}

/** Resuelve valores `{env:NAME}` desde process.env. */
function resolveEnv(values?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    const match = /^\{env:([A-Za-z0-9_]+)\}$/.exec(value)
    out[key] = match ? (process.env[match[1]] ?? '') : value
  }
  return out
}

/** Crea el transporte según el tipo de servidor. */
export function createTransport(config: McpServerConfig): RpcClient {
  return config.type === 'remote' ? new HttpTransport(config) : new StdioTransport(config)
}
