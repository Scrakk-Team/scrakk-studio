// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * OAuth MCP: CIMD como client_id, parámetro `resource` (RFC 8707) y PKCE.
 * Un authorization server falso verifica todo el flujo de extremo a extremo.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const opened: string[] = []
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/scrakk-oauth-test' },
  shell: { openExternal: (url: string) => { opened.push(url); return Promise.resolve() } }
}))

const { startOAuth, SCRAKK_CIMD_URL } = await import('../src/main/mcp/oauth')

beforeEach(() => {
  opened.length = 0
  // El caché de OAuth vive en userData (mockado a /tmp): limpiarlo para que
  // los tests no se contaminen entre sí cuando corre la suite completa.
  try {
    const fs = require('node:fs')
    fs.rmSync('/tmp/scrakk-oauth-test', { recursive: true, force: true })
  } catch { /* ignore */ }
})

describe('MCP OAuth (CIMD + RFC 8707)', () => {
  it('usa el CIMD público de scrakk.art como client_id', () => {
    expect(SCRAKK_CIMD_URL).toBe('https://scrakk.art/oauth/scrakk-studio.json')
  })

  it('construye /authorize con client_id CIMD, resource y PKCE', async () => {
    // AS falso: protected resource + metadata.
    const as = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('well-known')) {
        return {
          ok: true,
          json: async () => ({
            issuer: 'https://auth.example.com',
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token'
          })
        } as Response
      }
      // Probe del endpoint protegido: 401 con resource_metadata.
      return {
        ok: false,
        headers: { get: (name: string) => name === 'www-authenticate'
          ? 'Bearer resource_metadata="https://auth.example.com/.well-known/oauth-protected-resource"'
          : null }
      } as unknown as Response
    })

    const result = await startOAuth('cloudflare', 'https://mcp.cloudflare.com/mcp', undefined)
    as.mockRestore()

    expect(result.error).toBeUndefined()
    expect(result.url).toBeDefined()
    const params = new URL(result.url!).searchParams
    expect(params.get('client_id')).toBe(SCRAKK_CIMD_URL)
    expect(params.get('resource')).toBe('https://mcp.cloudflare.com/mcp')
    expect(params.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toBeTruthy()
    expect(params.get('state')).toBeTruthy()
    expect(opened[0]).toBe(result.url)
  }, 15_000)

  it('usa DCR cuando el AS no soporta CIMD (Cloudflare Bindings)', async () => {
    let registered = false
    const as = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown, init?: unknown) => {
      const url = String(input)
      const method = (init as { method?: string } | undefined)?.method ?? 'GET'
      if (method === 'POST' && url.includes('/register')) {
        registered = true
        return { ok: true, json: async () => ({ client_id: 'dcr-client-123' }) } as Response
      }
      if (url.includes('well-known')) {
        return {
          ok: true,
          json: async () => ({
            issuer: 'https://bindings.mcp.cloudflare.com',
            authorization_endpoint: 'https://bindings.mcp.cloudflare.com/oauth/authorize',
            token_endpoint: 'https://bindings.mcp.cloudflare.com/token',
            registration_endpoint: 'https://bindings.mcp.cloudflare.com/register',
            client_id_metadata_document_supported: false
          })
        } as Response
      }
      return {
        ok: false,
        headers: { get: () => null }
      } as unknown as Response
    })

    const result = await startOAuth('dcr-test-bindings', 'https://bindings.mcp.cloudflare.com/mcp', undefined)
    as.mockRestore()

    expect(registered).toBe(true)
    expect(result.url).toBeDefined()
    const params = new URL(result.url!).searchParams
    expect(params.get('client_id')).toBe('dcr-client-123')
    expect(params.get('resource')).toBe('https://bindings.mcp.cloudflare.com/mcp')
  }, 15_000)
})
