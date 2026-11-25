// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { EditorPanel } from './EditorPanel'
export { createEditorEngine, getStoredEngine, EDITOR_ENGINE_STORAGE_KEY } from './engine'
export type { EditorEngine, EditorEngineId } from './engine'
export {
  openFileInEditor,
  closeFile,
  renameFileTab,
  markFileDeleted,
  activateFile,
  clearActiveFile,
  moveFileTab,
  reorderOpenFilesTo,
  getEditorFiles,
  subscribeToEditorFiles
} from './editorBus'
export type { EditorFileTab, EditorFilesState } from './editorBus'
export { FileTabView } from './FileTabView'
export { openVirtualTab } from './virtualTabs'
export {
  getFileSession,
  renameFileSession,
  destroyFileSession,
  hasFileSession,
  getFileSessionText,
  reloadFileContent,
  isFileDirty
} from './fileSession'
export type { FileSession } from './fileSession'
export { requestCloseFile } from './closeGuard'
export { saveActiveFile, saveFileByPath } from './save'
export { InnertaEngine } from './engines/innerta/InnertaEngine'
export { performEditorEdit } from './engines/innerta/editorActions'
export type { EditorEditAction } from './engines/innerta/editorActions'