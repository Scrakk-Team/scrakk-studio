// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resultado de una tool → preview para la UI.
 *
 * El modelo necesita el contenido completo; el chat NO. Si `read_file` manda
 * el archivo entero a `onToolResult`, ese texto entra en `ChatMessage`, en el
 * render de React y en la persistencia de toda la sesión. Acá se deja solo
 * metadata + una muestra corta; el modal lee el archivo cuando el usuario
 * hace clic.
 */

const FILE_PREVIEW_CHARS = 2 * 1024
const MULTI_FILE_PREVIEW_CHARS = 512
const MULTI_TOOL_PREVIEW_CHARS = 8 * 1024
const TEXT_PREVIEW_CHARS = 4 * 1024

function asObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function previewFileResult(content: string): string | null {
  const parsed = asObject(content)
  if (!parsed || typeof parsed.content !== 'string') return null
  const full = parsed.content
  const { content: _content, ...meta } = parsed
  return JSON.stringify({
    ...meta,
    preview: full.slice(0, FILE_PREVIEW_CHARS),
    preview_truncated: full.length > FILE_PREVIEW_CHARS
  })
}

function previewMultipleFilesResult(content: string): string | null {
  const parsed = asObject(content)
  if (!parsed) return null
  const files = Object.entries(parsed).map(([path, value]) => {
    const entry =
      value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    const text = typeof entry.content === 'string' ? entry.content : ''
    const { content: _content, ...meta } = entry
    return {
      path,
      ...meta,
      bytes: text.length,
      preview: text.slice(0, MULTI_FILE_PREVIEW_CHARS),
      preview_truncated: text.length > MULTI_FILE_PREVIEW_CHARS
    }
  })
  return JSON.stringify({ files })
}

/** Preview que reemplaza al resultado completo en el estado del chat. */
export function previewToolResult(toolName: string, content: string): string {
  if (toolName === 'read_file') {
    return previewFileResult(content) ?? content
  }
  if (toolName === 'read_multiple_files') {
    return previewMultipleFilesResult(content) ?? content
  }
  if (toolName === 'multiple_tools') {
    return content.length > MULTI_TOOL_PREVIEW_CHARS
      ? `${content.slice(0, MULTI_TOOL_PREVIEW_CHARS)}\n… [truncated]`
      : content
  }
  if (toolName === 'list_directory' || toolName === 'execute_command') {
    return content.length > TEXT_PREVIEW_CHARS
      ? `${content.slice(0, TEXT_PREVIEW_CHARS)}\n… [truncated]`
      : content
  }
  return content
}
