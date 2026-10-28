// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { ToolDefinition } from '../types'
export const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'history_title',
    description:
      'Set the title of the current chat conversation. Call this once at the very ' +
      'start of a new conversation, as soon as the first user message makes the ' +
      'topic clear.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: "Short, specific title (3-7 words) in the user's language"
        }
      },
      required: ['title']
    }
  }
}
