// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Contrato MCP: normalización de nombres (como OpenCode) y IPC. */

import { describe, expect, it } from 'vitest'
import { MCP_IPC, mcpToolName, normalizeMcpName } from '../src/shared/mcp'
import { parsePermissionRule, evaluatePermissionRules } from '../src/renderer/src/services/ai/policy/permissionRules'

describe('MCP contract', () => {
  it('normaliza nombres como OpenCode: caracteres raros → _', () => {
    expect(normalizeMcpName('context 7')).toBe('context_7')
    expect(normalizeMcpName('resolve.library/id')).toBe('resolve_library_id')
    expect(mcpToolName('context 7', 'resolve.library/id')).toBe('context_7_resolve_library_id')
  })

  it('expone los canales IPC necesarios', () => {
    expect(MCP_IPC.configure).toBe('mcp:configure')
    expect(MCP_IPC.callTool).toBe('mcp:call-tool')
    expect(MCP_IPC.toolsChanged).toBe('mcp:tools-changed')
  })

  it('las reglas MCPTool(server_*) matchean tools MCP normalizados', () => {
    const rule = parsePermissionRule('MCPTool(context_7_*)', 'deny')
    expect(rule).not.toBeNull()
    const verdict = evaluatePermissionRules(
      { kind: 'mcp', name: 'context_7_resolve_library_id' },
      [rule!]
    )
    expect(verdict).toBe('deny')
  })

  it('una regla MCPTool no matchea otro servidor', () => {
    const rule = parsePermissionRule('MCPTool(context_7_*)', 'deny')!
    const verdict = evaluatePermissionRules(
      { kind: 'mcp', name: 'github_list_repos' },
      [rule]
    )
    expect(verdict).toBeNull()
  })
})
