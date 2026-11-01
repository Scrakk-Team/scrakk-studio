// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ExecutionResult, ToolContext } from '../types'
import { resolvePath } from '../utils'
import { api } from '@services/api'

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '.nuxt', '.output',
  '__pycache__', '.venv', 'venv', '.cache', '.turbo', 'coverage',
])

const MAX_LIST_ENTRIES = 500

export async function execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ExecutionResult> {
  try {
    const targetPath = args.path && args.path !== '.'
      ? resolvePath(args.path as string, ctx.projectRoot)
      : ctx.projectRoot

    const response = await api.fs.scanDirectory(targetPath, 1)

    if (!response.success) {
      return { success: false, content: `Error listing directory: ${response.error}` }
    }

    // Filter excluded directories
    const filtered = response.entries.filter(entry => {
      const segments = entry.path.replace(/\\/g, '/').split('/').filter(Boolean)
      return !segments.some(s => EXCLUDED_DIRS.has(s))
    })

    if (filtered.length === 0) {
      return {
        success: true,
        content: `Directory "${args.path || '.'}" is empty (no files or subdirectories).`
      }
    }

    const limited = filtered.slice(0, MAX_LIST_ENTRIES)
    const structure = limited.map(entry => {
      const prefix = entry.is_directory ? '📁 ' : '📄 '
      return `${prefix}${entry.path}`
    }).join('\n')

    const missing = filtered.length - limited.length
    return {
      success: true,
      content:
        missing > 0
          ? `${structure}\n\n… ${missing} more entries (truncated at ${MAX_LIST_ENTRIES})`
          : structure
    }
  } catch (error) {
    return { success: false, content: `Error listing directory: ${error}` }
  }
}
