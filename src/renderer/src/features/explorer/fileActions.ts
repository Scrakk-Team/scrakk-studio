// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Acciones reales de "abrir archivo / abrir carpeta / nuevo archivo".
 *
 * Existen porque los tres botones de la bienvenida llamaban a props que **nadie
 * pasaba**: el `PanelHost` monta el panel sin props, así que los defaults
 * (`() => {}`) hacían que se vieran perfectos y **no hicieran nada**. Acá vive
 * la implementación de verdad, una sola vez, y la usan la bienvenida y el menú
 * Archivo (antes cada uno tenía su copia).
 */

import { openFileInEditor } from '@features/editor'
import { getWorkspaceRoot, setWorkspaceRoot } from './hooks/useWorkspaceState'
import { baseNameOf } from '@services/workspaces/history'
import { api } from '@services/api'
import { revealInExplorer } from './selectInExplorer'

/** Separa con el separador que ya usa la ruta (Windows o POSIX). */
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`
}

/** Nombre base para un archivo recién creado, sin pisar uno existente. */
async function uniqueUntitledPath(root: string): Promise<string> {
  for (let i = 1; i < 1000; i += 1) {
    const name = i === 1 ? 'untitled.txt' : `untitled-${i}.txt`
    const candidate = joinPath(root, name)
    const res = await api.fs.exists(candidate)
    if (!res.exists) return candidate
  }
  return joinPath(root, `untitled-${Date.now()}.txt`)
}

/** Abre el diálogo nativo y abre los archivos elegidos en el editor. */
export async function openFilesViaDialog(): Promise<string[]> {
  const res = await api.fs.pickFile()
  if (!res.success || !res.paths) return []
  for (const filePath of res.paths) openFileInEditor(filePath, baseNameOf(filePath))
  return res.paths
}

/** Abre el diálogo nativo y cambia el workspace a la carpeta elegida. */
export async function openFolderViaDialog(): Promise<string | null> {
  const res = await api.fs.pickFolder()
  if (!res.success || !res.path) return null
  setWorkspaceRoot(res.path)
  return res.path
}

/**
 * Crea un archivo nuevo y lo abre en el editor.
 *
 * Necesita una carpeta donde crearlo: si no hay workspace abierto, primero se
 * pide (crear un archivo "en el aire" no tiene destino). El nombre se autogenera
 * libre para no pisar nada — renombrarlo es cosa del Explorer.
 */
export async function createNewFile(
  workspaceRoot = getWorkspaceRoot(),
  /** false cuando el Explorer va a poner el item en rename inline nativo. */
  openInEditor = true
): Promise<string | null> {
  const root = workspaceRoot ?? (await openFolderViaDialog())
  if (!root) return null
  const path = await uniqueUntitledPath(root)
  const written = await api.fs.writeFile(path, '')
  if (!written.success) return null
  if (openInEditor) {
    openFileInEditor(path, baseNameOf(path))
    // La bienvenida / menú Archivo crean el archivo fuera del panel: pedimos
    // al explorer nativo que seleccione la fila (ahora o al montarse).
    revealInExplorer(path)
  }
  return path
}

/** Nombre base libre para una carpeta recién creada. */
async function uniqueFolderName(root: string): Promise<string> {
  for (let i = 1; i < 1000; i += 1) {
    const name = i === 1 ? 'nueva-carpeta' : `nueva-carpeta-${i}`
    const res = await api.fs.exists(joinPath(root, name))
    if (!res.exists) return name
  }
  return `nueva-carpeta-${Date.now()}`
}

/**
 * Crea una carpeta nueva. Sin `name` se pide por diálogo (comportamiento
 * anterior); con `name` se crea directo para que el Explorer nativo pueda
 * ponerla en modo edición con su propio input.
 */
export async function createNewFolder(
  workspaceRoot = getWorkspaceRoot(),
  name?: string
): Promise<string | null> {
  const root = workspaceRoot ?? (await openFolderViaDialog())
  if (!root) return null
  const finalName = (name ?? window.prompt('Nombre de la carpeta', 'nueva-carpeta') ?? '').trim()
  if (!finalName) return null
  const path = joinPath(root, finalName)
  const res = await api.fs.mkdir(path)
  return res.success ? path : null
}

/** Crea una carpeta con nombre libre, sin pedirlo, para el rename inline. */
export async function createNewFolderPending(
  workspaceRoot = getWorkspaceRoot()
): Promise<string | null> {
  const root = workspaceRoot ?? (await openFolderViaDialog())
  if (!root) return null
  return createNewFolder(root, await uniqueFolderName(root))
}
