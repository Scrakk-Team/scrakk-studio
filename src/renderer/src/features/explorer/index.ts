// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Feature Explorer — panel de archivos del workspace.
 * Módulo autocontenido: hooks, componentes y estilos propios.
 */

export { ExplorerPanel } from './ExplorerPanel'
export { ExplorerRow, type RowAction } from './components/ExplorerRow'
export { setWorkspaceRoot, getWorkspaceRoot } from './hooks/useWorkspaceState'
export { createNewFile, openFilesViaDialog, openFolderViaDialog } from './fileActions'
export { ExplorerView, type ExplorerViewProps } from './ExplorerView'
export {
  ExplorerItemsView,
  type ExplorerItem,
  type ExplorerItemsViewProps
} from './ExplorerItemsView'
export type { FileNode } from './hooks/useWorkspaceState'
export {
  registerFileDecorationProvider,
  getFileDecoration,
  refreshFileDecorations,
  subscribeToDecorations,
  isGitDecorationsVisible,
  setGitDecorationsVisible,
  type FileDecoration,
  type FileDecorationProvider
} from './decorations'
export { ancestorDirs, filterRowsByPaths } from './filter'
export type { LassoContext } from './hooks/useSelectionBox'
