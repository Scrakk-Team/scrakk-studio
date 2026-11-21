// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * OAuth 2.1 + PKCE para servidores MCP remotos.
 *
 * Flujo genérico (como OpenCode): discovery RFC 8414 / protected-resource
 * metadata, autorización en el navegador con PKCE, callback en un puerto local
 * efímero, y refresh. Los tokens NO se guardan en `.scrakk/mcp.json`: viven en
 * `userData/mcp/oauth.json` con permisos restrictivos.
 */

import { app, shell } from 'electron'
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import path from 'node:path'
import type { McpOAuthConfig, McpServerConfig } from '@shared/mcp'

interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

interface PendingFlow {
  serverId: string
  verifier: string
  redirectUri: string
  authUrl: string
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  resolve: (result: { url?: string; error?: string }) => void
}

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'mcp', 'oauth.json')
}

function readTokens(): Record<string, TokenSet> {
  try {
    return JSON.parse(readFileSync(tokenFile(), 'utf-8')) as Record<string, TokenSet>
  } catch {
    return {}
  }
}

function writeTokens(tokens: Record<string, TokenSet>): void {
  const file = tokenFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(tokens, null, 2), 'utf-8')
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows no respeta chmod:ough.
  }
}

export function getToken(serverId: string): string | null {
  const token = readTokens()[serverId]
  if (!token) return null
  if (token.expiresAt && Date.now() >= token.expiresAt) return null
  return token.accessToken
}

/** Inicia el flujo OAuth. Devuelve la URL que el renderer debe abrir. */
export async function startOAuth(
  serverId: string,
  url: string,
  config: McpOAuthConfig | false | undefined
): Promise<{ url?: string; error?: string }> {
  if (config === false) return { error: 'OAuth desactivado para este servidor' }
  try {
    // 1) Descubrir el authorization server desde el endpoint protegido.
    const resource = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } }).catch(() => null)
    let issuer: string | null = null
    const protectedHeader = resource?.headers.get('www-authenticate')
    if (protectedHeader) {
      const match = /resource_metadata="([^"]+)"/i.exec(protectedHeader)
      if (match) {
        const metadataUrl = new URL(match[1], url).toString()
        const meta = await fetch(metadataUrl).then((r) => r.json()).catch(() => null) as Record<string, unknown> | null
        if (meta && typeof meta.authorization_servers === 'string') issuer = meta.authorization_servers
        else if (meta && Array.isArray(meta.authorization_servers)) issuer = String(meta.authorization_servers[0] ?? '')
      }
    }
    if (!issuer) {
      // Fallback: el propio host del endpoint.
      issuer = new URL(url).origin
    }
    const metaUrl = issuer.endsWith('/') ? `${issuer}.well-known/oauth-authorization-server` : `${issuer}/.well-known/oauth-authorization-server`
    const authMeta = await fetch(metaUrl).then((r) => r.json()).catch(() => null) as Record<string, unknown> | null
    const authorizationEndpoint = String(authMeta?.authorization_endpoint ?? `${issuer}/authorize`)
    const tokenEndpoint = String(authMeta?.token_endpoint ?? `${issuer}/token`)

    // 2) PKCE.
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const port = config && typeof config === 'object' && config.callbackPort ? config.callbackPort : 0
    const redirectUri =
      config && typeof config === 'object' && config.redirectUri
        ? config.redirectUri
        : `http://127.0.0.1:${port}/callback`

    const clientId =
      config && typeof config === 'object' && config.clientId
        ? config.clientId
        : 'scrakk-studio'

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: base64url(randomBytes(16)),
      ...(config && typeof config === 'object' && config.scope ? { scope: config.scope } : {})
    })
    const authUrl = `${authorizationEndpoint}${authorizationEndpoint.includes('?') ? '&' : '?'}${params.toString()}`

    return await new Promise<{ url?: string; error?: string }>((resolve) => {
      const pending: PendingFlow = {
        serverId, verifier, redirectUri, authUrl, tokenEndpoint,
        clientId,
        clientSecret: config && typeof config === 'object' ? config.clientSecret : undefined,
        resolve
      }
      startCallbackServer(pending)
      void shell.openExternal(authUrl)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function startCallbackServer(pending: PendingFlow): void {
  const parsed = new URL(pending.redirectUri)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', parsed.origin)
    const code = url.searchParams.get('code')
    if (!code) {
      res.writeHead(400).end('Missing code')
      pending.resolve({ error: 'El servidor no devolvió un código de autorización.' })
      server.close()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(
      '<html><body><h2>Autorización completa</h2><p>Puedes cerrar esta pestaña.</p></body></html>'
    )
    server.close()
    void exchangeCode(pending, code)
  })
  server.listen(Number(parsed.port) || 0, '127.0.0.1', () => {
    const address = server.address()
    if (address && typeof address === 'object' && !pending.redirectUri.includes(':')) {
      pending.redirectUri = `http://127.0.0.1:${address.port}/callback`
    }
    pending.resolve({ url: pending.authUrl })
  })
  server.on('error', (error) => {
    pending.resolve({ error: error.message })
  })
}

async function exchangeCode(pending: PendingFlow, code: string): Promise<void> {
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier
    })
    if (pending.clientSecret) body.set('client_secret', pending.clientSecret)
    const response = await fetch(pending.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
    const data = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error(String(data.error_description ?? data.error ?? `HTTP ${response.status}`))
    const tokens = readTokens()
    tokens[pending.serverId] = {
      accessToken: String(data.access_token ?? ''),
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      expiresAt: typeof data.expires_in === 'number' ? Date.now() + data.expires_in * 1000 : undefined
    }
    writeTokens(tokens)
  } catch (error) {
    console.error('[mcp:oauth] exchange failed', error)
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Config de ejemplo para OAuth (usado por el manager al crear el transporte). */
export function oauthConfigFor(server: McpServerConfig): McpOAuthConfig | false | undefined {
  return server.oauth
}
