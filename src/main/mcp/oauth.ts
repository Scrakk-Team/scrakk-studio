// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * OAuth 2.1 + PKCE para servidores MCP remotos.
 *
 * Registro de cliente vía CIMD (Client ID Metadata Document, spec MCP
 * 2026-07-28): nuestro client_id es una URL HTTPS pública que el authorization
 * server fetchea. Esto evita el "Invalid client_id" de un id inventado y es el
 * mismo mecanismo que usan OpenCode / ChatGPT / Claude.
 *
 * Incluye el parámetro `resource` (RFC 8707) que Cloudflare exige, puerto de
 * callback efímero resuelto ANTES de armar la URL, y verificación de `state`.
 * Los tokens NO se guardan en `.scrakk/mcp.json`: viven en userData.
 */

import { app, shell } from 'electron'
import http from 'node:http'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import path from 'node:path'
import type { McpOAuthConfig, McpServerConfig } from '@shared/mcp'

/** CIMD público de Scrakk Studio (Client ID Metadata Document). */
export const SCRAKK_CIMD_URL = 'https://scrakk.art/oauth/scrakk-studio.json'

interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

interface PendingFlow {
  serverId: string
  verifier: string
  redirectUri: string
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
  /** URI canónica del resource server (RFC 8707). */
  resource: string
  expectedIss?: string
  state: string
  authUrl: string
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
    // Windows no respeta chmod.
  }
}

export function getToken(serverId: string): string | null {
  const token = readTokens()[serverId]
  if (!token) return null
  if (token.expiresAt && Date.now() >= token.expiresAt) return null
  return token.accessToken
}

/**
 * Dynamic Client Registration (RFC 7591). Registra un clienteNaturno y guarda el
 * client_id en userData para reutilizarlo. `token_endpoint_auth_method: none`
 * porque usamos PKCE (no secretos).
 */
async function dynamicRegister(endpoint: string, serverId: string): Promise<string> {
  const cached = readClientIds()[serverId]
  if (cached) return cached
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: 'Scrakk Studio',
        client_uri: 'https://scrakk.art',
        redirect_uris: ['http://127.0.0.1/callback', 'http://localhost/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      })
    })
    if (!response.ok) return ''
    const data = await response.json() as Record<string, unknown>
    const id = typeof data.client_id === 'string' ? data.client_id : ''
    if (id) {
      const all = readClientIds()
      all[serverId] = id
      writeClientIds(all)
    }
    return id
  } catch {
    return ''
  }
}

function clientIdsFile(): string {
  return path.join(app.getPath('userData'), 'mcp', 'client-ids.json')
}

function readClientIds(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(clientIdsFile(), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

function writeClientIds(ids: Record<string, string>): void {
  const file = clientIdsFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(ids, null, 2), 'utf-8')
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows no respeta chmod.
  }
}

/** Canonicaliza la URI del resource server (sin query, sin fragmento). */
function canonicalResource(url: string): string {
  try {
    const parsed = new URL(url)
    // Cloudflare usa la URL base del servidor MCP como resource.
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

/** Inicia el flujo OAuth. Devuelve la URL que el renderer debe abrir. */
export async function startOAuth(
  serverId: string,
  url: string,
  config: McpOAuthConfig | false | undefined
): Promise<{ url?: string; error?: string }> {
  if (config === false) return { error: 'OAuth desactivado para este servidor' }
  try {
    const resource = canonicalResource(url)

    // 1) Protected Resource Metadata → authorization server (issuer).
    const probe = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } }).catch(() => null)
    let issuer: string | null = null
    const protectedHeader = probe?.headers.get('www-authenticate')
    if (protectedHeader) {
      const match = /resource_metadata="([^"]+)"/i.exec(protectedHeader)
      if (match) {
        const meta = await fetch(new URL(match[1], url).toString())
          .then((r) => r.json())
          .catch(() => null) as Record<string, unknown> | null
        if (meta && typeof meta.authorization_servers === 'string') issuer = meta.authorization_servers
        else if (meta && Array.isArray(meta.authorization_servers)) issuer = String(meta.authorization_servers[0] ?? '')
      }
    }
    // Fallbacks: algunos servers no mandan el header pero publican la metadata
    // en las rutas well-known (incluidas las variantes path-scoped de Cloudflare).
    if (!issuer) {
      const parsedUrl = new URL(url)
      const candidates = [
        `${parsedUrl.origin}/.well-known/oauth-protected-resource${parsedUrl.pathname.replace(/\/$/, '')}`,
        `${parsedUrl.origin}/.well-known/oauth-protected-resource`,
        `${url.replace(/\/$/, '')}/.well-known/oauth-protected-resource`
      ]
      for (const candidate of candidates) {
        const meta = await fetch(candidate).then((r) => r.json()).catch(() => null) as Record<string, unknown> | null
        if (!meta) continue
        if (typeof meta.authorization_servers === 'string') { issuer = meta.authorization_servers; break }
        if (Array.isArray(meta.authorization_servers)) { issuer = String(meta.authorization_servers[0] ?? ''); if (issuer) break }
      }
    }
    if (!issuer) issuer = new URL(url).origin

    // 2) Authorization Server Metadata (RFC 8414).
    const metaUrl = issuer.endsWith('/')
      ? `${issuer}.well-known/oauth-authorization-server`
      : `${issuer}/.well-known/oauth-authorization-server`
    const authMeta = await fetch(metaUrl).then((r) => r.json()).catch(() => null) as Record<string, unknown> | null
    const authorizationEndpoint = String(authMeta?.authorization_endpoint ?? `${issuer}/authorize`)
    const tokenEndpoint = String(authMeta?.token_endpoint ?? `${issuer}/token`)

    // 3) Registro de cliente, en orden de preferencia (spec MCP 2026-07-28):
    //    a) clientId pre-registrado en la config (importado de otro agente).
    //    b) CIMD público, SOLO si el AS lo anuncia.
    //    c) DCR (Dynamic Client Registration) si hay registration_endpoint.
    //    d) CIMD como último recurso (algunos servers no lo anuncian pero lo aceptan).
    let clientId =
      config && typeof config === 'object' && config.clientId
        ? config.clientId
        : ''
    const supportsCimd = authMeta?.client_id_metadata_document_supported === true
    const registrationEndpoint = typeof authMeta?.registration_endpoint === 'string'
      ? authMeta.registration_endpoint as string
      : null
    if (!clientId && supportsCimd) clientId = SCRAKK_CIMD_URL
    if (!clientId && registrationEndpoint) {
      clientId = await dynamicRegister(registrationEndpoint, serverId)
    }
    if (!clientId) clientId = SCRAKK_CIMD_URL

    // 4) PKCE + state.
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(16))

    // 5) Arrancar el callback server PRIMERO para conocer el puerto real.
    const port = config && typeof config === 'object' && config.callbackPort ? config.callbackPort : 0
    const baseRedirect =
      config && typeof config === 'object' && config.redirectUri
        ? config.redirectUri
        : `http://127.0.0.1:${port}/callback`

    return await new Promise<{ url?: string; error?: string }>((resolve) => {
      let settled = false
      const server = http.createServer((req, res) => {
        const parsed = new URL(req.url ?? '/', 'http://127.0.0.1')
        const code = parsed.searchParams.get('code')
        const returnedState = parsed.searchParams.get('state')
        const returnedIss = parsed.searchParams.get('iss')

        const fail = (message: string): void => {
          res.writeHead(400, { 'content-type': 'text/html' }).end(`<html><body><h2>Error</h2><p>${message}</p></body></html>`)
          server.close()
        }

        if (!code) return fail('El servidor no devolvió un código de autorización.')
        if (!safeEqual(returnedState ?? '', state)) return fail('state inválido (posible CSRF).')
        if (pending.expectedIss && returnedIss && returnedIss !== pending.expectedIss) {
          return fail('issuer inesperado.')
        }

        res.writeHead(200, { 'content-type': 'text/html' }).end(
          '<html><body><h2>Autorización completa</h2><p>Puedes cerrar esta pestaña.</p></body></html>'
        )
        server.close()
        void exchangeCode(pending, code)
      })

      const pending: PendingFlow = {
        serverId,
        verifier,
        redirectUri: baseRedirect,
        tokenEndpoint,
        clientId,
        clientSecret: config && typeof config === 'object' ? config.clientSecret : undefined,
        resource,
        expectedIss: typeof authMeta?.issuer === 'string' ? authMeta.issuer : (issuer ?? undefined),
        state,
        authUrl: ''
      }

      server.on('error', (error) => {
        if (!settled) {
          settled = true
          resolve({ error: error.message })
        }
      })
      server.listen(Number(new URL(baseRedirect).port) || 0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          // Sólo reemplazamos el puerto si era efímero (0).
          const parsed = new URL(baseRedirect)
          if (parsed.port === '0' || parsed.port === '') {
            parsed.port = String(address.port)
            pending.redirectUri = parsed.toString()
          }
        }

        const params = new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: pending.redirectUri,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
          resource,
          ...(config && typeof config === 'object' && config.scope ? { scope: config.scope } : {})
        })
        pending.authUrl = `${authorizationEndpoint}${authorizationEndpoint.includes('?') ? '&' : '?'}${params.toString()}`
        settled = true
        resolve({ url: pending.authUrl })
        void shell.openExternal(pending.authUrl)
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function exchangeCode(pending: PendingFlow, code: string): Promise<void> {
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: pending.resource
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

/** Comparación de `state` a prueba de timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Config de ejemplo para OAuth (usado por el manager al crear el transporte). */
export function oauthConfigFor(server: McpServerConfig): McpOAuthConfig | false | undefined {
  return server.oauth
}
