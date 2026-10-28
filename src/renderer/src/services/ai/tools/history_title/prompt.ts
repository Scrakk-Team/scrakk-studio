// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Guía dinámica de `history_title` (se inyecta en el system prompt junto a
 * las demás tools activas). El momento importa: el título debe nacer con la
 * primera respuesta, no cuando el usuario lo pida.
 */
export const prompt =
  'Call this exactly once at the very start of a new conversation, as soon as ' +
  'the first user message makes the topic clear. Include the call in your first ' +
  'response, before or alongside the answer, without asking the user first. ' +
  'Write a short, specific title (3-7 words) in the same language as the user, ' +
  'describing the task or topic rather than a greeting. Do not wrap it in quotes. ' +
  'Do not call it again unless the user starts a substantially different topic.'
