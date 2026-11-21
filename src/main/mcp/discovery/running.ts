// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Detecta servidores MCP ya corriendo en la máquina.
 *
 * En Linux/macOS usa `ps -eo pid,args`; en Windows `powershell Get-CimInstance`.
 * Identifica procesos cuyo nombre/args contienen `mcp` (ej. `*-mcp`,
 * `mcp-server-*`, `@modelcontextprotocol/server-*`). Es una pista, no una
 * garantía: el resultado se presenta como CANDIDATO para que el usuario lo
 * confirme (no se conecta automáticamente).
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { McpDiscoveredServer, McpServerConfig } from '@shared/mcp'

const execFileAsync = promisify(execFile)

/** Extrae el ejecutable (y args) de una línea de `ps`. */
function parseProcessLine(line: string): { pid: string; args: string[] } | null {
  const trimmed = line.trim()
  const match = /^(\d+)\s+(.*)$/.exec(trimmed)
  if (!match) return null
  const args = match[2].trim().split(/\s+/).filter(Boolean)
  if (args.length === 0) return null
  return { pid: match[1], args }
}

function looksLikeMcp(args: string[]): boolean {
  return args.some((arg) => {
    const base = arg.split('/').pop()?.toLowerCase() ?? ''
    return (
      /(^|[-_/])mcp($|[-_/.])/.test(base) ||
      base.startsWith('mcp-server') ||
      base.includes('@modelcontextprotocol') ||
      base.includes('mcp-server-')
    )
  })
}

/** Lista procesos MCP activos como candidatos. Nunca lanza. */
export async function discoverRunning(): Promise<{ servers: McpDiscoveredServer[]; scanned: string[]; errors: string[] }> {
  const scanned = ['procesos del sistema']
  const errors: string[] = []
  const found: McpDiscoveredServer[] = []

  try {
    let stdout = ''
    if (process.platform === 'win32') {
      const result = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | Format-Table -HideTableHeaders -AutoSize | Out-String -Width 4096'
      ], { timeout: 5000 })
      stdout = result.stdout
    } else {
      const result = await execFileAsync('ps', ['-eo', 'pid=,args='], { timeout: 5000 })
      stdout = result.stdout
    }

    for (const line of stdout.split('\n')) {
      const parsed = parseProcessLine(line)
      if (!parsed || !looksLikeMcp(parsed.args)) continue
      const exe = parsed.args[0]
      const name = exe.split('/').pop()?.replace(/\.(exe|cmd)$/i, '') ?? exe
      const id = `running-${name.replace(/[^A-Za-z0-9_-]/g, '_')}`
      if (found.some((s) => s.id === id)) continue
      const config: McpServerConfig = {
        id,
        type: 'local',
        command: parsed.args,
        label: `${name} (proceso activo)`
      }
      found.push({ id, source: 'running', config })
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  return { servers: found, scanned, errors }
}
