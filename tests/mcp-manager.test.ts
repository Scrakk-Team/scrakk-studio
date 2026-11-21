// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Integración del transporte stdio MCP con un servidor falso que habla
 * JSON-RPC por líneas (mismo framing que MCP). Verifica initialize + catalog.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/tmp' },
  shell: { openExternal: vi.fn() }
}))

const { StdioTransport } = await import('../src/main/mcp/transport')

/** Servidor MCP mínimo: responde initialize / tools/list / tools/call. */
const FAKE_SERVER = `
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    let result = {};
    if (msg.method === 'initialize') result = {
      protocolVersion: '2025-11-25', capabilities: {},
      serverInfo: { name: 'fake', version: '1', instructions: 'usa esta tool' }
    };
    else if (msg.method === 'tools/list') result = { tools: [{
      name: 'saludar', description: 'Saluda', inputSchema: { type: 'object', properties: { nombre: { type: 'string' } } }
    }]};
    else if (msg.method === 'tools/call') result = { content: [{ type: 'text', text: 'Hola ' + (msg.params?.arguments?.nombre ?? '') }] };
    if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');
  }
});
`

describe('MCP stdio transport', () => {
  it('hace initialize, lista tools y llama una tool', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-fake-'))
    const script = path.join(dir, 'server.cjs')
    fs.writeFileSync(script, FAKE_SERVER)

    const transport = new StdioTransport({
      id: 'fake',
      type: 'local',
      command: [process.execPath, script]
    })
    await transport.start()
    try {
      const init = await transport.request('initialize', {}, 5000) as { serverInfo?: { instructions?: string } }
      expect(init.serverInfo?.instructions).toBe('usa esta tool')

      const list = await transport.request('tools/list', undefined, 5000) as { tools: Array<{ name: string }> }
      expect(list.tools[0].name).toBe('saludar')

      const call = await transport.request('tools/call', { name: 'saludar', arguments: { nombre: 'Ana' } }, 5000) as { content: Array<{ text: string }> }
      expect(call.content[0].text).toBe('Hola Ana')
    } finally {
      transport.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 20_000)
})
