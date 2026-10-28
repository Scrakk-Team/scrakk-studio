// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Helpers puros del alcance (proyecto) del historial de chats.
 *
 * Se mantienen fuera del provider para poder testearlos sin React: el
 * historial global de localStorage se filtra por el id del proyecto activo.
 */

/** Cualquier registro que pueda tener (o no) un proyecto asignado. */
export interface ProjectScoped {
  projectId?: string
}

/** Sesiones visibles en el proyecto activo. */
export function filterSessionsByProject<T extends ProjectScoped>(
  sessions: readonly T[],
  projectId: string
): T[] {
  return sessions.filter((session) => session.projectId === projectId)
}

/**
 * Asigna el proyecto activo a las sesiones viejas (sin `projectId`).
 *
 * La migración es intencionalmente única: una vez asignadas quedan atadas a
 * ese proyecto y no vuelven a cambiar al abrir otra carpeta.
 */
export function migrateLegacySessions<T extends ProjectScoped>(
  sessions: T[],
  projectId: string
): { sessions: T[]; changed: boolean } {
  let changed = false
  const migrated = sessions.map((session) => {
    if (session.projectId !== undefined) return session
    changed = true
    return { ...session, projectId }
  })
  return { sessions: changed ? migrated : sessions, changed }
}
